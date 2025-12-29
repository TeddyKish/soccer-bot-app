from datetime import datetime, timedelta
import secrets

from tfab_framework.tfab_consts import Consts as TConsts

SESSION_TOKEN_FIELD = "Token"
SESSION_ROLE_FIELD = "Role"
SESSION_USER_ID_FIELD = "UserId"
SESSION_DISPLAY_NAME_FIELD = "DisplayName"
SESSION_CREATED_AT_FIELD = "CreatedAt"
SESSION_EXPIRES_AT_FIELD = "ExpiresAt"
SESSION_LAST_SEEN_FIELD = "LastSeen"

ATTEMPT_KEY_FIELD = "Key"
ATTEMPT_LIST_FIELD = "Attempts"
ATTEMPT_BLOCKED_UNTIL_FIELD = "BlockedUntil"
ATTEMPT_UPDATED_AT_FIELD = "UpdatedAt"


class AuthService:
    def __init__(self, db_handler, ttl_minutes=720, max_attempts=5, window_minutes=5, block_minutes=5):
        self.db = db_handler
        self.sessions = db_handler.get_collection(TConsts.SESSIONS_COLLECTION_NAME)
        self.attempts = db_handler.get_collection(TConsts.AUTH_ATTEMPTS_COLLECTION_NAME)
        self.session_ttl = timedelta(minutes=ttl_minutes)
        self.max_attempts = max_attempts
        self.window = timedelta(minutes=window_minutes)
        self.block_duration = timedelta(minutes=block_minutes)

    def is_blocked(self, key):
        now = datetime.utcnow()
        record = self.attempts.find_one({ATTEMPT_KEY_FIELD: key})
        if not record:
            return False, None

        blocked_until = record.get(ATTEMPT_BLOCKED_UNTIL_FIELD)
        if blocked_until and blocked_until <= now:
            self.attempts.update_one(
                {ATTEMPT_KEY_FIELD: key},
                {"$set": {ATTEMPT_BLOCKED_UNTIL_FIELD: None}},
            )
            blocked_until = None

        return (blocked_until is not None and blocked_until > now), blocked_until

    def register_failure(self, key):
        now = datetime.utcnow()
        record = self.attempts.find_one({ATTEMPT_KEY_FIELD: key})

        attempts = []
        if record:
            attempts = [
                entry
                for entry in record.get(ATTEMPT_LIST_FIELD, [])
                if entry > now - self.window
            ]

        attempts.append(now)
        blocked_until = None
        if len(attempts) >= self.max_attempts:
            blocked_until = now + self.block_duration

        self.attempts.update_one(
            {ATTEMPT_KEY_FIELD: key},
            {
                "$set": {
                    ATTEMPT_LIST_FIELD: attempts,
                    ATTEMPT_BLOCKED_UNTIL_FIELD: blocked_until,
                    ATTEMPT_UPDATED_AT_FIELD: now,
                },
                "$setOnInsert": {ATTEMPT_KEY_FIELD: key},
            },
            upsert=True,
        )

        return blocked_until

    def clear_failures(self, key):
        self.attempts.delete_one({ATTEMPT_KEY_FIELD: key})

    def create_session(self, role, user_id, display_name=None):
        token = secrets.token_urlsafe(32)
        now = datetime.utcnow()
        expires_at = now + self.session_ttl

        self.sessions.insert_one(
            {
                SESSION_TOKEN_FIELD: token,
                SESSION_ROLE_FIELD: role,
                SESSION_USER_ID_FIELD: user_id,
                SESSION_DISPLAY_NAME_FIELD: display_name,
                SESSION_CREATED_AT_FIELD: now,
                SESSION_EXPIRES_AT_FIELD: expires_at,
                SESSION_LAST_SEEN_FIELD: now,
            }
        )

        return token, expires_at

    def get_session(self, token):
        now = datetime.utcnow()
        record = self.sessions.find_one({SESSION_TOKEN_FIELD: token})
        if not record:
            return None
        if record.get(SESSION_EXPIRES_AT_FIELD) and record[SESSION_EXPIRES_AT_FIELD] <= now:
            self.sessions.delete_one({SESSION_TOKEN_FIELD: token})
            return None
        self.sessions.update_one(
            {SESSION_TOKEN_FIELD: token}, {"$set": {SESSION_LAST_SEEN_FIELD: now}}
        )
        return record

    def delete_session(self, token):
        self.sessions.delete_one({SESSION_TOKEN_FIELD: token})
