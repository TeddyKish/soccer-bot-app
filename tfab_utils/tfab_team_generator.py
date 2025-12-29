import random, math
from tfab_framework.tfab_consts import Consts as TConsts
from pulp import LpProblem, LpVariable, LpMinimize, lpSum, value, PULP_CBC_CMD, LpStatus, LpStatusInfeasible


class TeamGenerator(object):
    """
    Responsible for generating the most balanced teams out of a player list containing characteristics and ratings.
    """

    @staticmethod
    def generate_teams(player_dicts_list, balance_team_ratings=True, enforce_tiers=True, enforce_defense=False,
                       enforce_offense=False, enforce_total_roles=False, num_teams=3, coupling_constraints=None,
                       decoupling_constraints=None):
        """
        :param player_dicts_list: A list of dictionaries, each describing a player's Name, Characteristic, Rating.
        :param balance_team_ratings: Whether to add the constraint that the teams' ratings must be optimally balanced.
        :param enforce_tiers: Whether to add the constraint that each team must contain a player from each tier.
        :param enforce_defense: Whether to add the constraint that the amount of DEF players is balanced across teams.
        :param enforce_offense: Whether to add the constraint that the amount of ATT players is balanced across teams.
        :param enforce_total_roles: Whether to add the constraint that players with roles are balanced across teams.
        :param num_teams: The amount of teams to generate.
        :param coupling_constraints: A list where each entry is a "must be in the same team" constraint.
        :param decoupling_constraints: A list where each entry is a "mustn't be in the same team" constraint.
        :return: A list of dictionaries, each describing a team's players and the team's calculated score.
        """
        if coupling_constraints is None:
            coupling_constraints = []
        if decoupling_constraints is None:
            decoupling_constraints = []

        result_list = []
        player_name_to_index = {}

        for _ in range(num_teams):
            result_list.append({TConsts.MATCHDAYS_SPECIFIC_TEAM_ROSTER_KEY: [],
                                TConsts.MATCHDAYS_SPECIFIC_TEAM_RATING_KEY: 0})

        # Sort the list by the player ratings
        random.shuffle(player_dicts_list)  # Additional form of randomization when certain players have equal ratings
        sorted_players = sorted(player_dicts_list,
                                key=lambda player: player[TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY],
                                reverse=True)
        num_members = len(sorted_players)

        # Creating a variable for each <player, team> combination.
        # These variables will be interpreted as follows:
        # X_i_j equals 1 if player <I> belongs to group <J>
        prob = LpProblem("TeamGenerating", LpMinimize)
        x = {(i, j): LpVariable(f"x_Player{i}_Team{j}", 0, 1, "Binary") for i in range(num_members) for j in
             range(num_teams)}

        # Basic Constraints
        # -----------------

        # Enforce that each member is assigned to exactly one group
        for i in range(num_members):
            prob += lpSum(x[i, j] for j in range(num_teams)) == 1, f"AssignOnce_{i}"
            player_name_to_index[sorted_players[i][TConsts.PLAYERS_NAME_KEY]] = i

        for entry_index, entry in enumerate(coupling_constraints):
            for pair_index, (curr_name, next_name) in enumerate(zip(entry, entry[1:])):
                curr_player_index = player_name_to_index[curr_name]
                next_player_index = player_name_to_index[next_name]

                for j in range(num_teams):
                    prob += (
                        x[curr_player_index, j] == x[next_player_index, j],
                        f"Coupling_{entry_index}_{pair_index}_{curr_player_index}_{next_player_index}_{j}"
                    )

        for entry in decoupling_constraints:
            index_list = []
            for player in entry:
                index_list.append(player_name_to_index[player])

            for j in range(num_teams):
                prob += lpSum(x[i, j] for i in index_list) <= 1

        equal_sized_teams = (num_members % num_teams) == 0
        # Enforce that each group has the same amount of team members, or at most one additional member than the others
        if equal_sized_teams:
            # Teams can be equally-sized
            for j in range(num_teams):
                prob += lpSum(x[i, j] for i in range(num_members)) == (num_members // num_teams), f"GroupSize_{j}"
        else:
            # Teams can't be equally-sized
            smallest_team = LpVariable("smallest_team", 0, 100)
            largest_team = LpVariable("largest_team", 0, 100)
            for j in range(num_teams):
                prob += smallest_team <= lpSum(x[i, j] for i in range(num_members))
                prob += largest_team >= lpSum(x[i, j] for i in range(num_members))

            prob += largest_team - smallest_team <= 1

        # Distribute goalkeepers - Make sure at most one player in each team is a GK
        for j in range(num_teams):
            prob += lpSum(
                x[i, j] * (sorted_players[i][TConsts.PLAYERS_CHARACTERISTICS_KEY] ==
                           TConsts.PlayerCharacteristics["GOALKEEPER"]) for i in range(num_members)) <= 1

        # Advanced Constraints
        # --------------------

        # Enforce that the difference in ratings between the strongest team and the weakest team is optimal
        if balance_team_ratings and equal_sized_teams and TeamGenerator.get_gk_amount(player_dicts_list) in [num_teams, 0]:
            weakest_team = LpVariable("weakest_team", 0, 100)
            strongest_team = LpVariable("strongest_team", 0, 100)

            for j in range(num_teams):
                prob += weakest_team <= lpSum((x[i, j] *
                                               sorted_players[i][TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY])
                                              for i in range(num_members))
                prob += strongest_team >= lpSum((x[i, j] *
                                                 sorted_players[i][TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY])
                                                for i in range(num_members))

            prob += strongest_team - weakest_team, "Objective"

        # Enforce that each team contains a single player from each tier
        if enforce_tiers:
            for j in range(num_teams):
                for tier in range(num_members // num_teams):
                    prob += lpSum( x[i, j] * (TeamGenerator.get_player_tier(i, num_teams) == tier)
                            for i in range(num_members)) <= 1  # In-equation not tight to support different-sized teams

        if enforce_defense or enforce_offense or enforce_total_roles:
            # Define att_max as the largest amount of attackers in one team, and att_min as the smallest amount
            att_min = LpVariable("att_min", 0, 10)
            att_max = LpVariable("att_max", 0, 10)

            # The same for defenders
            def_min = LpVariable("def_min", 0, 10)
            def_max = LpVariable("def_max", 0, 10)

            # Then make sure it is correct globally - for all role-based players
            role_min = LpVariable("role_min", 0, 10)
            role_max = LpVariable("role_max", 0, 10)

            for j in range(num_teams):
                prob += role_min <= lpSum(
                    x[i, j] * (sorted_players[i][TConsts.PLAYERS_CHARACTERISTICS_KEY] in
                               [TConsts.PlayerCharacteristics["OFFENSIVE"], TConsts.PlayerCharacteristics["DEFENSIVE"]])
                    for i in range(num_members))
                prob += role_max >= lpSum(
                    x[i, j] * (sorted_players[i][TConsts.PLAYERS_CHARACTERISTICS_KEY] in
                               [TConsts.PlayerCharacteristics["OFFENSIVE"],
                                TConsts.PlayerCharacteristics["DEFENSIVE"]])
                    for i in range(num_members))
                prob += att_min <= lpSum(
                    x[i, j] * (sorted_players[i][TConsts.PLAYERS_CHARACTERISTICS_KEY] ==
                               TConsts.PlayerCharacteristics["OFFENSIVE"])
                    for i in range(num_members))
                prob += att_max >= lpSum(
                    x[i, j] * (sorted_players[i][TConsts.PLAYERS_CHARACTERISTICS_KEY] ==
                               TConsts.PlayerCharacteristics["OFFENSIVE"])
                    for i in range(num_members))
                prob += def_min <= lpSum(
                    x[i, j] * (sorted_players[i][TConsts.PLAYERS_CHARACTERISTICS_KEY] ==
                               TConsts.PlayerCharacteristics["DEFENSIVE"])
                    for i in range(num_members))
                prob += def_max >= lpSum(
                    x[i, j] * (sorted_players[i][TConsts.PLAYERS_CHARACTERISTICS_KEY] ==
                               TConsts.PlayerCharacteristics["DEFENSIVE"])
                    for i in range(num_members))

            if enforce_defense:
                prob += def_max - def_min <= 1
            if enforce_offense:
                prob += att_max - att_min <= 1
            if enforce_total_roles:
                prob += role_max - role_min <= 1

        # Solve the LP problem
        seed = random.choice([i for i in range(100)])
        cbc_solver = PULP_CBC_CMD(keepFiles=False,
                                  # Set random seed to ensure reproducibility, passes as command-line arg to solver
                                  options=[f"RandomS {seed}"])
        prob.solve(cbc_solver)
        if prob.status == LpStatusInfeasible:
            return None

        for i in range(num_members):
            for j in range(num_teams):
                if value(x[i, j]) == 1:
                    result_list[j][TConsts.MATCHDAYS_SPECIFIC_TEAM_ROSTER_KEY].append(sorted_players[i])
                    result_list[j][TConsts.MATCHDAYS_SPECIFIC_TEAM_RATING_KEY] += sorted_players[i][
                        TConsts.MATCHDAYS_SPECIFIC_TEAM_PLAYER_RATING_KEY]

        # Correct the ratings calculation to support special cases. Calculation Logic is documented above.
        if TeamGenerator.get_gk_amount(player_dicts_list) != num_teams:  # A team with no GK exists
            for j in range(num_teams):
                team_list = result_list[j][TConsts.MATCHDAYS_SPECIFIC_TEAM_ROSTER_KEY]
                team_size = len(team_list)
                if team_size == math.ceil(num_members / num_teams) and TeamGenerator.get_gk_amount(team_list) == 0:
                    # We should only perform this downscaling if the team size is maximized AND it has no GK
                    result_list[j][TConsts.MATCHDAYS_SPECIFIC_TEAM_RATING_KEY] *= ((team_size - 1) / team_size)

        return result_list

    @staticmethod
    def calculate_team_rating(player_list):
        """
        Calculates the rating of the team represented by <player_list>.
        :param player_list: A list of the players comprising the team.
        :return: The calculated average rating of the team.
        """
        # determine if the team has a goalie or not
        # if it has one - sum all the players
        # otherwise - calculate all permutations, average it and there you have the rating

    @staticmethod
    def get_player_tier(player_index, tier_size):
        """
        :param player_index: The index of the requested player.
        :param tier_size: The size of each tier (practically, the amount of teams)
        :return: Returns the tier for the player at <player_index> in the sorted players list.
        """
        return player_index // tier_size

    @staticmethod
    def get_gk_amount(player_list):
        """
        :param player_list: The player list to count GKs in.
        :return: The amount of GKs in <player_list>.
        """
        gks = 0
        for player in player_list:
            if player[TConsts.PLAYERS_CHARACTERISTICS_KEY] == TConsts.PlayerCharacteristics["GOALKEEPER"]:
                gks += 1

        return gks
