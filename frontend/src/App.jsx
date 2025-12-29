import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const API_BASE = "";

const positionOptions = [
  { value: "ALL", label: "כל המגרש" },
  { value: "GK", label: "שוער" },
  { value: "ATT", label: "התקפה" },
  { value: "DEF", label: "הגנה" }
];

const apiFetch = async (path, options = {}, token) => {
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  };

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, config);
  if (!response.ok) {
    let detail = "בקשה נכשלה";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") {
        detail = data.detail;
      } else if (data.detail?.message) {
        detail = data.detail.message;
      }
    } catch (error) {
      detail = "בקשה נכשלה";
    }
    throw new Error(detail);
  }
  return response.json();
};

const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const success = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!success) {
    throw new Error("copy-failed");
  }
};

const formatRating = (value) => (value ? Number(value).toFixed(2) : "0.00");
const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));
const roundToTenth = (value) => Math.round(value * 10) / 10;
const formatTodayDate = () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${day}-${month}-${year}`;
};
const positionClass = (position) => {
  switch (position) {
    case "GK":
      return "pos-gk";
    case "ATT":
      return "pos-att";
    case "DEF":
      return "pos-def";
    default:
      return "pos-all";
  }
};
const roleOrder = ["GK", "DEF", "ATT", "ALL"];
const roleLabels = {
  GK: "שוער",
  DEF: "הגנה",
  ATT: "התקפה",
  ALL: "כל המגרש"
};
const positionOrder = {
  GK: 0,
  DEF: 1,
  ATT: 2,
  ALL: 3
};
const comparePlayersByPosition = (a, b) => {
  const aOrder = positionOrder[a.position] ?? 99;
  const bOrder = positionOrder[b.position] ?? 99;
  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  return (b.averageRating ?? 0) - (a.averageRating ?? 0);
};
const comparePlayersByRating = (a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0);
const resolveGroupRole = (members = []) => {
  let selected = "ALL";
  let bestOrder = 99;
  members.forEach((member) => {
    const order = positionOrder[member.position] ?? 99;
    if (order < bestOrder) {
      bestOrder = order;
      selected = member.position || "ALL";
    }
  });
  return selected;
};
const groupKey = (group) => [...group].sort().join("|");
const normalizeConstraintGroups = (groups) =>
  (groups || [])
    .map((entry) => Array.from(new Set(entry)).filter(Boolean))
    .filter((entry) => entry.length >= 2);
const removePlayerFromConstraints = (groups, name) =>
  normalizeConstraintGroups(
    (groups || []).map((group) => group.filter((member) => member !== name))
  );
const adminTabs = [
  { id: "matches", label: "משחקים", icon: "matches" },
  { id: "players", label: "שחקנים", icon: "players" },
  { id: "settings", label: "איזון", icon: "settings" },
  { id: "stats", label: "נתונים", icon: "stats" }
];

const TabIcon = ({ name }) => {
  switch (name) {
    case "matches":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "players":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 5l3 2 4-2 4 2 3-2v14H5z"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
          />
          <path d="M9 5v14M15 5v14" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
          />
          <path
            d="M4 12h2m12 0h2M12 4v2m0 12v2M6.7 6.7l1.4 1.4m7.8 7.8l1.4 1.4m0-11.6l-1.4 1.4M8.1 15.9l-1.4 1.4"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      );
    case "stats":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 19V9m7 10V5m7 14v-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return null;
  }
};

const StatIcon = ({ name }) => {
  switch (name) {
    case "date":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="6" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 4v4M16 4v4M4 10h16" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "time":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 8v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "location":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 21s6-6.2 6-11a6 6 0 10-12 0c0 4.8 6 11 6 11z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="12" cy="10" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "players":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M7 14c-2.2 0-4 1.8-4 4v2h8v-2c0-2.2-1.8-4-4-4z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="7" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M17 13c-1.7 0-3 1.3-3 3v4h6v-4c0-1.7-1.3-3-3-3z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="17" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    default:
      return null;
  }
};

const ActionIcon = ({ name }) => {
  switch (name) {
    case "plus":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "trash":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 7h12M9 7v12m6-12v12M10 4h4l1 2H9l1-2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="7" y="7" width="10" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "copy":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="9" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6 15V5a2 2 0 012-2h8" stroke="currentColor" strokeWidth="1.6" fill="none" />
        </svg>
      );
    default:
      return null;
  }
};

const PositionIcon = ({ role }) => {
  switch (role) {
    case "GK":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 18V7h16v11" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M4 11h16" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "DEF":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3l7 3v5c0 4.7-3.1 8.2-7 10-3.9-1.8-7-5.3-7-10V6l7-3z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "ATT":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 4l6 6-1.6 1.6L13.6 9.6V20h-3.2V9.6L7.6 11.6 6 10z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
  }
};

const BadgeIcon = ({ name }) => {
  switch (name) {
    case "star":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"
            fill="currentColor"
          />
        </svg>
      );
    case "hammer":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2.5" y="4" width="9" height="4.5" rx="1" fill="currentColor" />
          <path d="M9.5 8.5l2-2 9 9-2 2z" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
};

const RatingBadge = ({ value }) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }
  if (numericValue > 7) {
    return (
      <span className="rating-badge rating-badge-star" title="שחקן מוביל">
        <BadgeIcon name="star" />
        <span className="sr-only">שחקן מוביל</span>
      </span>
    );
  }
  if (numericValue <= 4) {
    return (
      <span className="rating-badge rating-badge-carpenter" title="צריך חיזוק">
        <BadgeIcon name="hammer" />
        <span className="sr-only">צריך חיזוק</span>
      </span>
    );
  }
  return null;
};

const RatingSlider = ({
  value,
  average,
  onChange,
  disabled = false,
  valueStyle = null
}) => {
  const safeAvg = average > 0 ? average : 5;
  const percent = clampNumber(((safeAvg - 1) / 9) * 100, 0, 100);
  return (
    <div className="slider-wrap">
      <div className="slider-track">
        <input
          type="range"
          min="1"
          max="10"
          step="0.1"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className={`slider ${disabled ? "disabled" : ""}`}
          aria-label="דירוג"
          disabled={disabled}
        />
        <span
          className="slider-mark"
          style={{ left: `calc(${percent}% - 6px)` }}
          title={`ממוצע ${formatRating(safeAvg)}`}
        />
      </div>
      <span className="slider-value" style={valueStyle}>
        {Number(value).toFixed(1)}
      </span>
    </div>
  );
};

const usePaginatedList = (items, pageSize = 10, autoLoad = false, threshold = 220) => {
  const [visible, setVisible] = useState(pageSize);

  useEffect(() => {
    setVisible(pageSize);
  }, [items, pageSize]);

  useEffect(() => {
    if (!autoLoad) {
      return undefined;
    }
    let ticking = false;
    const handleScroll = () => {
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(() => {
        const nearBottom =
          window.innerHeight + window.scrollY >=
          document.body.offsetHeight - threshold;
        if (nearBottom) {
          setVisible((prev) =>
            prev < items.length ? Math.min(prev + pageSize, items.length) : prev
          );
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [autoLoad, items.length, pageSize, threshold, visible]);

  const visibleItems = items.slice(0, visible);
  const canLoadMore = items.length > visible;

  return { visibleItems, canLoadMore };
};

const CollapsibleCard = ({
  title,
  subtitle,
  children,
  defaultOpen = true,
  collapsible = false,
  titleAction = null
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;
  return (
    <div className={`card collapsible card-animated ${isOpen ? "open" : "collapsed"}`}>
      <div className="collapse-header">
        {collapsible ? (
          <button
            className="collapse-toggle"
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={isOpen}
          >
            <div className="collapse-title">
              <div className="section-title">{title}</div>
              {subtitle ? <div className="section-subtitle">{subtitle}</div> : null}
            </div>
            <span className={`collapse-chevron ${isOpen ? "open" : ""}`} aria-hidden="true" />
          </button>
        ) : (
          <div className="collapse-toggle static">
            <div className="collapse-title">
              <div className="section-title">{title}</div>
              {subtitle ? <div className="section-subtitle">{subtitle}</div> : null}
            </div>
          </div>
        )}
        {titleAction ? <div className="title-action">{titleAction}</div> : null}
      </div>
      {isOpen ? <div className="collapsible-body">{children}</div> : null}
    </div>
  );
};

const LandingScreen = ({ onSelect }) => (
  <section className="section landing-screen">
    <div className="landing-actions">
      <button
        className="button button-primary landing-button"
        type="button"
        onClick={() => onSelect("admin")}
      >
        מנהלים
      </button>
      <button
        className="button button-secondary landing-button"
        type="button"
        onClick={() => onSelect("ranker")}
      >
        מדרגים
      </button>
    </div>
  </section>
);

const Modal = ({ open, children }) => {
  if (!open) {
    return null;
  }
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">{children}</div>
    </div>
  );
};

const App = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState([]);
  const [authMode, setAuthMode] = useState(null);

  const pushNotice = (notice) => {
    if (!notice) {
      return;
    }
    const id = `${Date.now()}-${Math.random()}`;
    setNotices((prev) => [...prev, { id, ...notice }]);
    window.setTimeout(() => {
      setNotices((prev) => prev.filter((item) => item.id !== id));
    }, 3800);
  };

  useEffect(() => {
    const stored = localStorage.getItem("tfabSession");
    if (!stored) {
      setLoading(false);
      return;
    }

    const parsed = JSON.parse(stored);
    apiFetch("/api/auth/me", {}, parsed.token)
      .then((data) => {
        setSession({ ...parsed, ...data });
      })
      .catch(() => {
        localStorage.removeItem("tfabSession");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = async (role, password, displayName) => {
    pushNotice(null);
    const result = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ role, password, displayName })
    });
    const nextSession = {
      token: result.token,
      role: result.role,
      displayName: result.displayName
    };
    localStorage.setItem("tfabSession", JSON.stringify(nextSession));
    setSession(nextSession);
    setAuthMode(null);
  };

  const handleLogout = async () => {
    if (session?.token) {
      try {
        await apiFetch("/api/auth/logout", { method: "POST" }, session.token);
      } catch (error) {
        // Ignore logout errors
      }
    }
    localStorage.removeItem("tfabSession");
    setSession(null);
    setAuthMode(null);
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">טוען...</div>
      </div>
    );
  }

  return (
    <div className="container">
      {session ? (
        <header className="hero">
          <div className="hero-brand">
            <div className="logo-mark">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="48" fill="#5ee4d6" />
                <circle cx="50" cy="50" r="44" fill="#0f1626" />
                <polygon points="50,22 67,35 60,56 40,56 33,35" fill="#7c6bff" />
                <circle cx="50" cy="50" r="6" fill="#0f1626" />
              </svg>
            </div>
            <div>
              <span className="badge">BOTITO FC</span>
              <div className="title">ניהול משחקי כדורגל</div>
              <div className="subtitle">
                סגלים, דירוגים והגרלות - הכל במקום אחד, דינמי ומהיר.
              </div>
            </div>
          </div>
          <div className="card session-card">
            <div className="pill">{session.role === "admin" ? "מנהל" : "מדרג"}</div>
            <div className="session-name">
              {session.displayName || "כניסה פעילה"}
            </div>
            <div className="button-row">
              <button className="button button-secondary" onClick={handleLogout}>
                יציאה
              </button>
            </div>
          </div>
        </header>
      ) : null}

      <div className="toast-center" aria-live="polite">
        {notices.map((notice) => (
          <div key={notice.id} className={`toast ${notice.type}`}>
            {notice.message}
          </div>
        ))}
      </div>

      {!session ? (
        authMode ? (
          <LoginScreen
            mode={authMode}
            onLogin={handleLogin}
            onBack={() => setAuthMode(null)}
            setNotice={pushNotice}
          />
        ) : (
          <LandingScreen onSelect={setAuthMode} />
        )
      ) : session.role === "admin" ? (
        <AdminDashboard session={session} setNotice={pushNotice} />
      ) : (
        <RankerDashboard session={session} setNotice={pushNotice} />
      )}
    </div>
  );
};

const LoginScreen = ({ mode, onLogin, onBack, setNotice }) => {
  const [adminPassword, setAdminPassword] = useState("");
  const [rankerPassword, setRankerPassword] = useState("");
  const [rankerName, setRankerName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (mode === "admin") {
        await onLogin("admin", adminPassword);
      } else {
        await onLogin("ranker", rankerPassword, rankerName);
      }
      setNotice(null);
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="section fade-in">
      <div className="login-shell">
        <div className="card login-card">
          <div className="pill">{mode === "admin" ? "כניסת מנהלים" : "כניסת מדרגים"}</div>
          <div className="section-title">
            {mode === "admin" ? "ממשק ניהול" : "ממשק דירוגים"}
          </div>
          <div className="divider" />
          {mode === "admin" ? (
            <>
              <label>סיסמת מנהל</label>
              <input
                className="input"
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="הזן סיסמה"
              />
            </>
          ) : (
            <>
              <label>שם מזוהה</label>
              <input
                className="input"
                value={rankerName}
                onChange={(event) => setRankerName(event.target.value)}
                placeholder="לדוגמה: טדי"
              />
              <div style={{ marginTop: "12px" }}>
                <label>סיסמת מדרג</label>
                <input
                  className="input"
                  type="password"
                  value={rankerPassword}
                  onChange={(event) => setRankerPassword(event.target.value)}
                  placeholder="הזן סיסמה"
                />
              </div>
            </>
          )}
          <div className="button-row" style={{ marginTop: "16px" }}>
            <button
              className="button button-primary"
              onClick={handleSubmit}
              disabled={loading}
            >
              כניסה
            </button>
            <button className="button button-secondary" type="button" onClick={onBack}>
              חזרה
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

const TeamRoster = ({ players }) => {
  const orderedPlayers = [...players].sort(comparePlayersByRating);
  return (
    <div className="list" style={{ marginTop: "12px" }}>
      {orderedPlayers.map((player) => {
        return (
          <div
            className={`player-row team-player position-tone ${positionClass(player.position)} ${
              player.position === "GK" ? "goalkeeper" : ""
            }`}
            key={player.name}
          >
            <strong className="player-name">
              <span className="role-icon">
                <PositionIcon role={player.position} />
              </span>
              <span>{player.name}</span>
              <RatingBadge value={player.averageRating} />
            </strong>
            <span className="chip">
              {formatRating(player.averageRating)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const AdminDashboard = ({ session, setNotice }) => {
  const token = session.token;
  const [players, setPlayers] = useState([]);
  const [matchday, setMatchday] = useState(null);
  const [settings, setSettings] = useState(null);
  const [constraints, setConstraints] = useState({ couplings: [], decouplings: [] });
  const [statistics, setStatistics] = useState({
    overview: null,
    players: [],
    matchdays: []
  });
  const [activeTab, setActiveTab] = useState("matches");
  const [importMessage, setImportMessage] = useState("");
  const [playerModal, setPlayerModal] = useState(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [guestSetup, setGuestSetup] = useState(null);
  const [matchdayEdit, setMatchdayEdit] = useState(null);
  const [constraintGroups, setConstraintGroups] = useState([]);
  const [draggingPlayer, setDraggingPlayer] = useState(null);
  const [mergePulse, setMergePulse] = useState(null);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => b.averageRating - a.averageRating);
  }, [players]);
  const filteredPlayers = useMemo(() => {
    const term = playerSearch.trim().toLowerCase();
    if (!term) {
      return sortedPlayers;
    }
    return sortedPlayers.filter((player) => player.name.toLowerCase().includes(term));
  }, [sortedPlayers, playerSearch]);

  const rosterDetails = matchday?.rosterDetails || [];
  const guestsList = matchday?.guests || [];
  const guestNames = useMemo(
    () => new Set(guestsList.map((guest) => guest.name)),
    [guestsList]
  );
  const rosterList = useMemo(
    () =>
      rosterDetails.map((player) => ({
        ...player,
        isGuest: guestNames.has(player.name)
      })),
    [rosterDetails, guestNames]
  );
  const rosterNameSet = useMemo(
    () => new Set(rosterList.map((player) => player.name)),
    [rosterList]
  );
  const replacementOptions = useMemo(
    () => players.filter((player) => !rosterNameSet.has(player.name)),
    [players, rosterNameSet]
  );
  const normalizedConstraintGroups = useMemo(() => {
    const rosterNames = new Set(rosterList.map((player) => player.name));
    return normalizeConstraintGroups(constraintGroups || [])
      .map((group) => group.filter((name) => rosterNames.has(name)))
      .filter((group) => group.length >= 2);
  }, [constraintGroups, rosterList]);
  const rosterDisplay = useMemo(() => {
    if (!rosterList.length) {
      return [];
    }
    const rosterOrder = rosterList.map((player) => player.name);
    const rosterLookup = new Map(rosterList.map((player) => [player.name, player]));
    const groupByName = new Map();
    normalizedConstraintGroups.forEach((group) => {
      const key = groupKey(group);
      group.forEach((name) => groupByName.set(name, { key, names: group }));
    });
    const usedGroups = new Set();
    const display = [];
    rosterOrder.forEach((name) => {
      const player = rosterLookup.get(name);
      if (!player) {
        return;
      }
      const groupEntry = groupByName.get(name);
      if (groupEntry) {
        if (usedGroups.has(groupEntry.key)) {
          return;
        }
        const members = rosterOrder
          .filter((memberName) => groupEntry.names.includes(memberName))
          .map((memberName) => rosterLookup.get(memberName))
          .filter(Boolean);
        display.push({ type: "group", key: groupEntry.key, members });
        usedGroups.add(groupEntry.key);
        return;
      }
      display.push({ type: "player", player });
    });
    return display;
  }, [normalizedConstraintGroups, rosterList]);
  const visibleRoster = rosterDisplay;
  const rosterByRole = useMemo(() => {
    const lines = {
      GK: [],
      DEF: [],
      ATT: [],
      ALL: []
    };
    visibleRoster.forEach((item) => {
      const role =
        item.type === "group"
          ? resolveGroupRole(item.members)
          : item.player?.position || "ALL";
      const normalizedRole = roleOrder.includes(role) ? role : "ALL";
      lines[normalizedRole].push(item);
    });
    return lines;
  }, [visibleRoster]);

  const {
    visibleItems: visiblePlayerList
  } = usePaginatedList(filteredPlayers, 10, true);

  const {
    visibleItems: visibleStatsPlayers
  } = usePaginatedList(statistics.players || [], 10, true);

  const {
    visibleItems: visibleStatsMatchdays
  } = usePaginatedList(statistics.matchdays || [], 10, true);

  const refreshAll = async () => {
    try {
      const [playersRes, matchdayRes, settingsRes, constraintsRes, statsRes] =
        await Promise.all([
          apiFetch("/api/admin/players", {}, token),
          apiFetch("/api/admin/matchday/today", {}, token),
          apiFetch("/api/admin/settings", {}, token),
          apiFetch("/api/admin/constraints", {}, token).catch(() => ({
            couplings: [],
            decouplings: []
          })),
          apiFetch("/api/admin/statistics", {}, token).catch(() => ({
            overview: null,
            players: [],
            matchdays: []
          }))
        ]);
      const todayValue = formatTodayDate();
      const nextMatchday =
        matchdayRes.matchday && matchdayRes.matchday.date === todayValue
          ? matchdayRes.matchday
          : null;
      setPlayers(playersRes.players || []);
      setMatchday(nextMatchday);
      setSettings(settingsRes.settings || null);
      setConstraints({
        couplings: constraintsRes.couplings || [],
        decouplings: constraintsRes.decouplings || []
      });
      setStatistics({
        overview: statsRes.overview || null,
        players: statsRes.players || [],
        matchdays: statsRes.matchdays || []
      });
      if (!nextMatchday) {
        setConstraintGroups([]);
        setMergePulse(null);
        setMatchdayEdit(null);
      }
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (matchday && matchday.date !== formatTodayDate()) {
        setMatchday(null);
        setConstraintGroups([]);
        setMatchdayEdit(null);
      }
    }, 60000);
    return () => window.clearInterval(interval);
  }, [matchday]);

  useEffect(() => {
    setConstraintGroups(normalizeConstraintGroups(constraints.couplings || []));
  }, [constraints.couplings]);


  const handleAddPlayer = async (player) => {
    if (!player?.name?.trim()) {
      setNotice({ type: "error", message: "יש להזין שם שחקן" });
      return false;
    }
    try {
      await apiFetch(
        "/api/admin/players",
        {
          method: "POST",
          body: JSON.stringify({ name: player.name, position: player.position })
        },
        token
      );
      await refreshAll();
      setNotice({ type: "success", message: "השחקן נוסף" });
      return true;
    } catch (error) {
      setNotice({ type: "error", message: error.message });
      return false;
    }
  };

  const handleEditPlayer = async (player) => {
    if (!player?.name) {
      setNotice({ type: "error", message: "בחר שחקן לעריכה" });
      return false;
    }
    try {
      await apiFetch(
        `/api/admin/players/${encodeURIComponent(player.name)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ position: player.position })
        },
        token
      );
      await refreshAll();
      setNotice({ type: "success", message: "השחקן עודכן" });
      return true;
    } catch (error) {
      setNotice({ type: "error", message: error.message });
      return false;
    }
  };

  const handleDeletePlayer = async (name) => {
    if (!name) {
      return;
    }
    try {
      await apiFetch(
        `/api/admin/players/${encodeURIComponent(name)}`,
        { method: "DELETE" },
        token
      );
      await refreshAll();
      setNotice({ type: "success", message: "השחקן נמחק" });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  const handleSavePlayerModal = async () => {
    if (!playerModal) {
      return;
    }
    const success =
      playerModal.mode === "add"
        ? await handleAddPlayer(playerModal)
        : await handleEditPlayer(playerModal);
    if (success) {
      setPlayerModal(null);
    }
  };

  const finalizeImport = async (message, guests = []) => {
    const payload = guests.length ? { message, guests } : { message };
    const result = await apiFetch(
      "/api/admin/matchday/import",
      {
        method: "POST",
        body: JSON.stringify(payload)
      },
      token
    );
    setMatchday(result.matchday);
    setImportMessage("");
    await refreshAll();
    setNotice({ type: "success", message: "הרשימה נקלטה בהצלחה" });
  };

  const handleImportMatchday = async () => {
    if (!importMessage.trim()) {
      setNotice({ type: "error", message: "חובה להדביק הודעה" });
      return;
    }
    try {
      const preview = await apiFetch(
        "/api/admin/matchday/preview",
        {
          method: "POST",
          body: JSON.stringify({ message: importMessage })
        },
        token
      );
      const guests = preview.guests || [];
      if (guests.length) {
        const setupGuests = guests.map((guest) => ({
          originalName: guest.PlayerName || guest.name || guest.playerName || guest.player || "",
          name: guest.PlayerName || guest.name || guest.playerName || guest.player || "",
          position: "ALL",
          rating: 5,
          invitedBy: guest.invitedBy
        }));
        setGuestSetup({
          open: true,
          index: 0,
          guests: setupGuests,
          message: importMessage
        });
        return;
      }
      await finalizeImport(importMessage);
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  const handleGenerateTeams = async () => {
    if (!matchday) {
      setNotice({ type: "error", message: "אין רשימה פעילה להגרלה" });
      return;
    }
    try {
      const result = await apiFetch(
        "/api/admin/matchday/generate",
        { method: "POST" },
        token
      );
      setMatchday(result.matchday);
      await refreshAll();
      setNotice({ type: "success", message: "הכוחות נוצרו בהצלחה" });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  const handleRemoveMatchday = async () => {
    try {
      await apiFetch("/api/admin/matchday/today", { method: "DELETE" }, token);
      setMatchday(null);
      setConstraintGroups([]);
      setMergePulse(null);
      setMatchdayEdit(null);
      await refreshAll();
      setNotice({ type: "success", message: "הרשימה הוסרה" });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  const handleCopyRatings = async () => {
    if (!sortedPlayers.length) {
      setNotice({ type: "error", message: "אין דירוגים לייצוא" });
      return;
    }
    const lines = sortedPlayers.map(
      (player, index) =>
        `${index + 1}. ${player.name} (${player.positionLabel}) - ${formatRating(
          player.averageRating
        )}`
    );
    const message = `דירוגים נוכחיים:\n${lines.join("\n")}`;
    try {
      await copyTextToClipboard(message);
      setNotice({ type: "success", message: "הדירוגים הועתקו ללוח" });
    } catch (error) {
      setNotice({ type: "error", message: "לא הצלחתי להעתיק ללוח" });
    }
  };

  const syncConstraintGroups = async (groups) => {
    if (!matchday) {
      setNotice({ type: "error", message: "יש להגדיר רשימה לפני הוספת חיבורים" });
      return;
    }
    try {
      await apiFetch("/api/admin/constraints", { method: "DELETE" }, token);
      for (const group of groups) {
        if (group.length < 2) {
          continue;
        }
        await apiFetch(
          "/api/admin/constraints/couple",
          {
            method: "POST",
            body: JSON.stringify({ players: group })
          },
          token
        );
      }
      await refreshAll();
      setNotice({ type: "success", message: "החיבורים עודכנו" });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  const movePlayerToTargetPlayer = (groups, source, target) => {
    if (!source || !target || source === target) {
      return normalizeConstraintGroups(groups || []);
    }
    const normalizedGroups = normalizeConstraintGroups(groups || []);
    const sourceIndex = normalizedGroups.findIndex((entry) => entry.includes(source));
    const targetIndex = normalizedGroups.findIndex((entry) => entry.includes(target));

    if (sourceIndex === targetIndex && sourceIndex !== -1) {
      return normalizedGroups;
    }

    if (targetIndex === -1) {
      const withoutSource = removePlayerFromConstraints(normalizedGroups, source);
      return normalizeConstraintGroups([...withoutSource, [source, target]]);
    }

    const withoutSource = removePlayerFromConstraints(normalizedGroups, source);
    return normalizeConstraintGroups(
      withoutSource.map((group) =>
        group.includes(target) ? Array.from(new Set([...group, source])) : group
      )
    );
  };

  const movePlayerToTargetGroup = (groups, source, targetKey) => {
    if (!source || !targetKey) {
      return normalizeConstraintGroups(groups || []);
    }
    const normalizedGroups = normalizeConstraintGroups(groups || []);
    const targetGroup = normalizedGroups.find((group) => groupKey(group) === targetKey);
    if (!targetGroup || targetGroup.includes(source)) {
      return normalizedGroups;
    }
    const withoutSource = removePlayerFromConstraints(normalizedGroups, source);
    return normalizeConstraintGroups(
      withoutSource.map((group) =>
        groupKey(group) === targetKey ? Array.from(new Set([...group, source])) : group
      )
    );
  };

  const triggerMergePulse = (group) => {
    if (!group || group.length < 2) {
      return;
    }
    const key = groupKey(group);
    setMergePulse(key);
    window.setTimeout(() => {
      setMergePulse((prev) => (prev === key ? null : prev));
    }, 450);
  };

  const handleConstraintDrop = async (source, target) => {
    if (!source || !target || source === target) {
      return;
    }
    const nextGroups = movePlayerToTargetPlayer(constraintGroups, source, target);
    setConstraintGroups(nextGroups);
    const updatedGroup = nextGroups.find(
      (group) => group.includes(source) && group.includes(target)
    );
    triggerMergePulse(updatedGroup);
    await syncConstraintGroups(nextGroups);
  };

  const handleGroupDrop = async (source, targetKey) => {
    if (!source) {
      return;
    }
    const nextGroups = movePlayerToTargetGroup(constraintGroups, source, targetKey);
    setConstraintGroups(nextGroups);
    const updatedGroup = nextGroups.find((group) => groupKey(group) === targetKey);
    triggerMergePulse(updatedGroup);
    await syncConstraintGroups(nextGroups);
  };

  const handleConstraintRemove = async (source) => {
    if (!source) {
      return;
    }
    if (!constraintGroups.some((group) => group.includes(source))) {
      return;
    }
    const nextGroups = removePlayerFromConstraints(constraintGroups, source);
    setConstraintGroups(nextGroups);
    await syncConstraintGroups(nextGroups);
  };

  const updateGuestSetupField = (field, value) => {
    setGuestSetup((prev) => {
      if (!prev) {
        return prev;
      }
      const guests = prev.guests.map((guest, index) => {
        if (index !== prev.index) {
          return guest;
        }
        const updated = { ...guest, [field]: value };
        if (field === "position" && value === "GK") {
          updated.rating = 0;
        }
        return updated;
      });
      return { ...prev, guests };
    });
  };

  const handleGuestSetupNext = async () => {
    if (!guestSetup) {
      return;
    }
    const current = guestSetup.guests[guestSetup.index];
    if (!current.name || !current.name.trim()) {
      setNotice({ type: "error", message: "יש להזין שם אורח תקין" });
      return;
    }
    if (guestSetup.index < guestSetup.guests.length - 1) {
      setGuestSetup((prev) => ({ ...prev, index: prev.index + 1 }));
      return;
    }
    const normalizedGuests = guestSetup.guests
      .map((guest) => ({
        ...guest,
        name: guest.name.trim(),
        rating:
          guest.position === "GK"
            ? 0
            : clampNumber(Number(guest.rating || 1), 1, 10)
      }))
      .filter((guest) => guest.name);
    try {
      await finalizeImport(guestSetup.message, normalizedGuests);
      setGuestSetup(null);
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  const handleGuestSetupBack = () => {
    setGuestSetup((prev) => {
      if (!prev || prev.index === 0) {
        return prev;
      }
      return { ...prev, index: prev.index - 1 };
    });
  };

  const handleMatchdayGuestSave = async () => {
    if (!matchdayEdit || !matchdayEdit.isGuest) {
      return;
    }
    try {
      const ratingValue =
        matchdayEdit.position === "GK"
          ? 0
          : clampNumber(Number(matchdayEdit.rating || 1), 1, 10);
      const result = await apiFetch(
        "/api/admin/matchday/guests",
        {
          method: "POST",
          body: JSON.stringify({
            name: matchdayEdit.name,
            position: matchdayEdit.position,
            rating: ratingValue
          })
        },
        token
      );
      setMatchday(result.matchday);
      setMatchdayEdit(null);
      await refreshAll();
      setNotice({ type: "success", message: "אורח עודכן" });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  const handleReplaceMatchdayPlayer = async () => {
    if (!matchdayEdit) {
      return;
    }
    const replacement = matchdayEdit.replacementName?.trim();
    if (!replacement) {
      setNotice({ type: "error", message: "יש לבחור שחקן חלופי" });
      return;
    }
    if (replacement === matchdayEdit.name) {
      setNotice({ type: "error", message: "יש לבחור שחקן שונה" });
      return;
    }
    try {
      const result = await apiFetch(
        "/api/admin/matchday/roster/replace",
        {
          method: "POST",
          body: JSON.stringify({
            currentName: matchdayEdit.name,
            replacementName: replacement
          })
        },
        token
      );
      setMatchday(result.matchday);
      setMatchdayEdit(null);
      await refreshAll();
      setNotice({ type: "success", message: "השחקן עודכן ברשימה" });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  const handleSettingChange = async (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    try {
      await apiFetch(
        "/api/admin/settings",
        { method: "PATCH", body: JSON.stringify({ [key]: value }) },
        token
      );
      setNotice({ type: "success", message: "ההגדרה עודכנה" });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  const handleNumericSetting = async (key, value) => {
    try {
      await apiFetch(
        "/api/admin/settings",
        { method: "PATCH", body: JSON.stringify({ [key]: value }) },
        token
      );
      await refreshAll();
      setNotice({ type: "success", message: "ההגדרה עודכנה" });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  return (
    <section className="section admin-shell">
      <datalist id="players-datalist">
        {players.map((player) => (
          <option key={player.name} value={player.name} />
        ))}
      </datalist>
      <datalist id="matchday-replace-datalist">
        {replacementOptions.map((player) => (
          <option key={player.name} value={player.name} />
        ))}
      </datalist>
      <div className="admin-nav">
        {adminTabs.map((tab) => (
          <button
            key={tab.id}
            className={`nav-button ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            <span className="nav-icon">
              <TabIcon name={tab.icon} />
            </span>
            <span className="nav-text">
              <span className="nav-label">{tab.label}</span>
            </span>
          </button>
        ))}
      </div>

      {activeTab === "matches" && (
        <>
          {matchday ? (
            <CollapsibleCard
              title="משחק היום"
              titleAction={
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={handleRemoveMatchday}
                >
                  <ActionIcon name="trash" />
                  <span className="sr-only">הסרת משחק</span>
                </button>
              }
            >
              <div className="stat-grid">
                <div className="stat-card compact">
                  <span className="stat-icon" aria-hidden="true">
                    <StatIcon name="date" />
                  </span>
                  <span className="sr-only">תאריך</span>
                  <strong>{matchday.date}</strong>
                </div>
                <div className="stat-card compact">
                  <span className="stat-icon" aria-hidden="true">
                    <StatIcon name="time" />
                  </span>
                  <span className="sr-only">שעה</span>
                  <strong>{matchday.time || "לא ידוע"}</strong>
                </div>
                <div className="stat-card compact">
                  <span className="stat-icon" aria-hidden="true">
                    <StatIcon name="location" />
                  </span>
                  <span className="sr-only">מיקום</span>
                  <strong>{matchday.location}</strong>
                </div>
                <div className="stat-card compact">
                  <span className="stat-icon" aria-hidden="true">
                    <StatIcon name="players" />
                  </span>
                  <span className="sr-only">שחקנים</span>
                  <strong>
                    {(matchday.roster?.length || 0) + (matchday.guests?.length || 0)}
                  </strong>
                </div>
              </div>
              <div className="roster-panel">
                <div
                  className="roster-lines"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggingPlayer) {
                      handleConstraintRemove(draggingPlayer);
                    }
                    setDraggingPlayer(null);
                  }}
                >
                  {roleOrder.map((role, roleIndex) => {
                    const items = rosterByRole[role] || [];
                    if (!items.length) {
                      return null;
                    }
                    return (
                      <div key={role} className={`roster-line ${positionClass(role)}`}>
                        <span className="roster-line-label">{roleLabels[role]}</span>
                        <div className="bubble-list">
                          {items.map((item, index) => {
                            const delay = roleIndex * 0.15 + index * 0.05;
                            if (item.type === "group") {
                              return (
                                <div
                                  key={item.key}
                                  className={`roster-bubble roster-group ${
                                    mergePulse === item.key ? "merge-pulse" : ""
                                  }`}
                                  onDragOver={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                  }}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (draggingPlayer) {
                                      handleGroupDrop(draggingPlayer, item.key);
                                    }
                                    setDraggingPlayer(null);
                                  }}
                                  style={{ animationDelay: `${delay}s` }}
                                >
                                  <div className="group-members">
                                    {item.members.map((member) => (
                                      <span
                                        key={member.name}
                                        className={`group-member position-tone ${positionClass(
                                          member.position
                                        )} ${member.isGuest ? "guest" : ""}`}
                                        draggable
                                        onDragStart={() => setDraggingPlayer(member.name)}
                                        onDragEnd={() => setDraggingPlayer(null)}
                                        onDragOver={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                        }}
                                        onDrop={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          if (draggingPlayer) {
                                            handleConstraintDrop(draggingPlayer, member.name);
                                          }
                                          setDraggingPlayer(null);
                                        }}
                                        onClick={() => {
                                          const guestEntry = guestsList.find(
                                            (guest) => guest.name === member.name
                                          );
                                          setMatchdayEdit({
                                            name: member.name,
                                            isGuest: member.isGuest,
                                            position:
                                              guestEntry?.position || member.position || "ALL",
                                            rating: guestEntry?.rating ?? 0,
                                            invitedBy: guestEntry?.invitedBy,
                                            replacementName: ""
                                          });
                                        }}
                                      >
                                        <span className="roster-name">
                                          <span className="role-icon">
                                            <PositionIcon role={member.position} />
                                          </span>
                                          {member.name}
                                          <RatingBadge value={member.averageRating} />
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            }
                            const player = item.player;
                            return (
                              <button
                                key={player.name}
                                type="button"
                                className={`roster-bubble position-tone ${positionClass(
                                  player.position
                                )} ${player.isGuest ? "guest" : ""}`}
                                draggable
                                onDragStart={() => setDraggingPlayer(player.name)}
                                onDragEnd={() => setDraggingPlayer(null)}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  if (draggingPlayer) {
                                    handleConstraintDrop(draggingPlayer, player.name);
                                  }
                                  setDraggingPlayer(null);
                                }}
                                onClick={() => {
                                  const guestEntry = guestsList.find(
                                    (guest) => guest.name === player.name
                                  );
                                  setMatchdayEdit({
                                    name: player.name,
                                    isGuest: player.isGuest,
                                    position: guestEntry?.position || player.position || "ALL",
                                    rating: guestEntry?.rating ?? 0,
                                    invitedBy: guestEntry?.invitedBy,
                                    replacementName: ""
                                  });
                                }}
                                style={{ animationDelay: `${delay}s` }}
                              >
                                <span className="roster-name">
                                  <span className="role-icon">
                                    <PositionIcon role={player.position} />
                                  </span>
                                  {player.name}
                                  <RatingBadge value={player.averageRating} />
                                </span>
                                {player.isGuest && <span className="bubble-hint">אורח</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {matchday.teams?.length ? (
                <>
                  <div className="divider" />
                  <div className="grid grid-3">
                {matchday.teams.map((team, index) => {
                  const sortedTeamPlayers = [...team.players].sort(comparePlayersByPosition);
                  return (
                    <div className="card card-strong team-card" key={`team-${index}`}>
                      <div className="pill">קבוצה {index + 1}</div>
                      <div className="team-score">
                        ממוצע קבוצה: {formatRating(team.averageRating ?? team.rating)}
                      </div>
                      <TeamRoster players={sortedTeamPlayers} />
                    </div>
                  );
                })}
                  </div>
                </>
              ) : null}
              <div className="button-row centered" style={{ marginTop: "16px" }}>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={handleGenerateTeams}
                >
                  צור כוחות
                </button>
              </div>
            </CollapsibleCard>
          ) : (
            <CollapsibleCard title="ייבוא רשימה">
              <textarea
                className="textarea"
                value={importMessage}
                onChange={(event) => setImportMessage(event.target.value)}
                placeholder="הדבק כאן את ההודעה"
              />
              <div className="button-row" style={{ marginTop: "12px" }}>
                <button className="button button-primary" onClick={handleImportMatchday}>
                  קבע רשימה להיום
                </button>
              </div>
            </CollapsibleCard>
          )}
        </>
      )}

      {activeTab === "players" && (
        <div className="grid">
          <CollapsibleCard
            title="שחקנים"
            titleAction={
              <>
                <button
                  className="icon-button add"
                  type="button"
                  onClick={() =>
                    setPlayerModal({
                      mode: "add",
                      name: "",
                      position: "ALL"
                    })
                  }
                >
                  <ActionIcon name="plus" />
                  <span className="sr-only">הוספת שחקן</span>
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={handleCopyRatings}
                >
                  <ActionIcon name="copy" />
                  <span className="sr-only">העתקת דירוגים</span>
                </button>
              </>
            }
          >
            <div className="player-toolbar">
              <input
                className="input input-compact"
                list="players-datalist"
                value={playerSearch}
                onChange={(event) => setPlayerSearch(event.target.value)}
                placeholder="חיפוש שחקן"
              />
            </div>
            <div className="list" style={{ marginTop: "12px" }}>
              {visiblePlayerList.map((player) => {
                return (
                  <div className="player-chip-row" key={player.name}>
                    <button
                      className={`player-chip position-tone ${positionClass(player.position)}`}
                      type="button"
                      onClick={() =>
                        setPlayerModal({
                          mode: "edit",
                          name: player.name,
                          position: player.position || "ALL"
                        })
                      }
                    >
                      <div className="player-chip-info">
                        <span className="player-chip-name">
                          <span className="role-icon">
                            <PositionIcon role={player.position} />
                          </span>
                          {player.name}
                          <RatingBadge value={player.averageRating} />
                        </span>
                      </div>
                      <span className="chip">
                        {formatRating(player.averageRating)}
                      </span>
                    </button>
                    <button
                      className="icon-button danger"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeletePlayer(player.name);
                      }}
                    >
                      <ActionIcon name="trash" />
                      <span className="sr-only">מחיקה</span>
                    </button>
                  </div>
                );
              })}
              {!filteredPlayers.length && <div className="notice">אין שחקנים עדיין</div>}
            </div>
          </CollapsibleCard>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="grid grid-2">
          <CollapsibleCard title="פרמטרים ליצירת קבוצות">
            {settings ? (
              <div className="list" style={{ marginTop: "12px" }}>
                <div className="switch">
                  <span>איזון דירוגי קבוצות</span>
                  <input
                    type="checkbox"
                    checked={settings.balanceRatings}
                    onChange={(event) =>
                      handleSettingChange("balanceRatings", event.target.checked)
                    }
                  />
                </div>
                <div className="switch">
                  <span>ווידוא שחקן מכל דרג</span>
                  <input
                    type="checkbox"
                    checked={settings.enforceTiers}
                    onChange={(event) =>
                      handleSettingChange("enforceTiers", event.target.checked)
                    }
                  />
                </div>
                <div className="switch">
                  <span>איזון שחקני הגנה</span>
                  <input
                    type="checkbox"
                    checked={settings.enforceDefense}
                    onChange={(event) =>
                      handleSettingChange("enforceDefense", event.target.checked)
                    }
                  />
                </div>
                <div className="switch">
                  <span>איזון שחקני התקפה</span>
                  <input
                    type="checkbox"
                    checked={settings.enforceOffense}
                    onChange={(event) =>
                      handleSettingChange("enforceOffense", event.target.checked)
                    }
                  />
                </div>
                <div className="switch">
                  <span>איזון תפקידים כללי</span>
                  <input
                    type="checkbox"
                    checked={settings.enforceRoles}
                    onChange={(event) =>
                      handleSettingChange("enforceRoles", event.target.checked)
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="notice">טוען הגדרות...</div>
            )}
          </CollapsibleCard>
          <CollapsibleCard title="כוונון עדין">
            {settings ? (
              <div className="list" style={{ marginTop: "12px" }}>
                <label>מספר קבוצות</label>
                <div className="button-row">
                  <input
                    className="input"
                    type="number"
                    min="2"
                    max="10"
                    value={settings.numTeams}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        numTeams: Number(event.target.value)
                      }))
                    }
                  />
                  <button
                    className="button button-secondary"
                    onClick={() => handleNumericSetting("numTeams", settings.numTeams)}
                  >
                    עדכון
                  </button>
                </div>
                <label>סף סטייה לדירוגים</label>
                <div className="button-row">
                  <input
                    className="input"
                    type="number"
                    step="0.25"
                    min="0.5"
                    max="3"
                    value={settings.deviationThreshold}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        deviationThreshold: Number(event.target.value)
                      }))
                    }
                  />
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      handleNumericSetting(
                        "deviationThreshold",
                        settings.deviationThreshold
                      )
                    }
                  >
                    עדכון
                  </button>
                </div>
              </div>
            ) : (
              <div className="notice">טוען...</div>
            )}
          </CollapsibleCard>
        </div>
      )}

      {activeTab === "stats" && (
        <div className="stats-shell">
          <CollapsibleCard title="סקירת על">
            <div className="grid grid-3">
              <div className="card stat-card">
                <span>משחקים</span>
                <strong>{statistics.overview?.totalMatchdays ?? 0}</strong>
              </div>
              <div className="card stat-card">
                <span>שחקנים ייחודיים</span>
                <strong>{statistics.overview?.totalPlayers ?? 0}</strong>
              </div>
              <div className="card stat-card">
                <span>ממוצע סגל</span>
                <strong>{statistics.overview?.averageRosterSize ?? 0}</strong>
              </div>
              <div className="card stat-card">
                <span>סה״כ הופעות</span>
                <strong>{statistics.overview?.totalAppearances ?? 0}</strong>
              </div>
              <div className="card stat-card">
                <span>משחק אחרון</span>
                <strong>{statistics.overview?.lastMatchDate || "לא ידוע"}</strong>
              </div>
            </div>
          </CollapsibleCard>
          <div className="grid grid-2">
            <CollapsibleCard title="הופעות לפי שחקן">
              <div className="list">
                {statistics.players.length ? (
                  visibleStatsPlayers.map((player) => (
                    <div className="player-row" key={player.name}>
                      <strong>{player.name}</strong>
                      <span>הופעות: {player.appearances}</span>
                      <span>
                        הופעה אחרונה: {player.lastAppearance || "לא ידוע"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="notice">אין נתונים עדיין</div>
                )}
              </div>
            </CollapsibleCard>
            <CollapsibleCard title="משחקים אחרונים">
              <div className="list">
                {statistics.matchdays.length ? (
                  visibleStatsMatchdays.map((entry) => (
                    <div className="player-row" key={`${entry.date}-${entry.location}`}>
                      <strong>{entry.date || "ללא תאריך"}</strong>
                      <span>{entry.location || "ללא מיקום"}</span>
                      <span>
                        סגל: {entry.rosterCount + entry.guestCount}
                      </span>
                      <span>{entry.teamsGenerated ? "בוצעה הגרלה" : "ללא הגרלה"}</span>
                    </div>
                  ))
                ) : (
                  <div className="notice">אין משחקים מתועדים</div>
                )}
              </div>
              <div className="divider" />
              <div className="pill">
                משחק אחרון: {statistics.overview?.lastMatchDate || "לא ידוע"}
              </div>
            </CollapsibleCard>
          </div>
        </div>
      )}

      <Modal open={Boolean(playerModal)}>
        {playerModal ? (
          <>
            <div className="modal-header">
              {playerModal.mode === "add" ? "הוספת שחקן" : "עריכת שחקן"}
            </div>
            <div className="modal-body">
              <div className="stack">
                <label>שם שחקן</label>
                <input
                  className="input"
                  list="players-datalist"
                  value={playerModal.name}
                  disabled={playerModal.mode !== "add"}
                  onChange={(event) =>
                    setPlayerModal((prev) => ({
                      ...prev,
                      name: event.target.value
                    }))
                  }
                  placeholder="שם מלא"
                />
                <label>תפקיד</label>
                <select
                  className="select"
                  value={playerModal.position || "ALL"}
                  onChange={(event) =>
                    setPlayerModal((prev) => ({
                      ...prev,
                      position: event.target.value
                    }))
                  }
                >
                  {positionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="button-row">
              <button
                className="button button-primary"
                type="button"
                onClick={handleSavePlayerModal}
              >
                שמירה
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setPlayerModal(null)}
              >
                ביטול
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal open={Boolean(guestSetup?.open)}>
        {guestSetup ? (
          <>
            <div className="modal-header">
              הגדרת אורחים {guestSetup.index + 1}/{guestSetup.guests.length}
            </div>
            <div className="modal-body">
              <div className="stack">
                <label>שם אורח</label>
                <input
                  className="input"
                  value={guestSetup.guests[guestSetup.index]?.name || ""}
                  onChange={(event) => updateGuestSetupField("name", event.target.value)}
                />
                <label>תפקיד</label>
                <select
                  className="select"
                  value={guestSetup.guests[guestSetup.index]?.position || "ALL"}
                  onChange={(event) =>
                    updateGuestSetupField("position", event.target.value)
                  }
                >
                  {positionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label>דירוג</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={guestSetup.guests[guestSetup.index]?.rating ?? 0}
                  disabled={guestSetup.guests[guestSetup.index]?.position === "GK"}
                  onChange={(event) =>
                    updateGuestSetupField("rating", event.target.value)
                  }
                />
                {guestSetup.guests[guestSetup.index]?.invitedBy ? (
                  <div className="pill ghost-pill">
                    הוזמן ע״י {guestSetup.guests[guestSetup.index]?.invitedBy}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="button-row">
              <button
                className="button button-secondary"
                type="button"
                onClick={handleGuestSetupBack}
                disabled={guestSetup.index === 0}
              >
                הקודם
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={handleGuestSetupNext}
              >
                {guestSetup.index === guestSetup.guests.length - 1
                  ? "שמירת אורחים"
                  : "הבא"}
              </button>
              <button
                className="button button-danger"
                type="button"
                onClick={() => setGuestSetup(null)}
              >
                ביטול
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal open={Boolean(matchdayEdit)}>
        {matchdayEdit ? (
          <>
            <div className="modal-header">עריכת שחקן</div>
            <div className="modal-body">
              <div className="stack">
                <div className="pill">{matchdayEdit.name}</div>
                <label>החלפה לשחקן</label>
                <input
                  className="input"
                  list="matchday-replace-datalist"
                  value={matchdayEdit.replacementName || ""}
                  onChange={(event) =>
                    setMatchdayEdit((prev) => ({
                      ...prev,
                      replacementName: event.target.value
                    }))
                  }
                  placeholder="בחר שחקן חלופי"
                />
                {matchdayEdit.isGuest ? (
                  <>
                    <label>תפקיד</label>
                    <select
                      className="select"
                      value={matchdayEdit.position || "ALL"}
                      onChange={(event) =>
                        setMatchdayEdit((prev) => ({
                          ...prev,
                          position: event.target.value,
                          rating: event.target.value === "GK" ? 0 : prev.rating
                        }))
                      }
                    >
                      {positionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <label>דירוג</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={matchdayEdit.rating ?? 0}
                      disabled={matchdayEdit.position === "GK"}
                      onChange={(event) =>
                        setMatchdayEdit((prev) => ({
                          ...prev,
                          rating: event.target.value
                        }))
                      }
                    />
                    {matchdayEdit.invitedBy ? (
                      <div className="pill ghost-pill">
                        הוזמן ע״י {matchdayEdit.invitedBy}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
            <div className="button-row">
              <button
                className="button button-primary"
                type="button"
                onClick={handleReplaceMatchdayPlayer}
                disabled={!matchdayEdit.replacementName?.trim()}
              >
                החלפה
              </button>
              {matchdayEdit.isGuest ? (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={handleMatchdayGuestSave}
                >
                  שמירת אורח
                </button>
              ) : null}
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setMatchdayEdit(null)}
              >
                סגור
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </section>
  );
};

const RankerDashboard = ({ session, setNotice }) => {
  const token = session.token;
  const [players, setPlayers] = useState([]);
  const [draftRatings, setDraftRatings] = useState({});
  const [savedRatings, setSavedRatings] = useState({});
  const rowRefs = useRef(new Map());
  const lastPositions = useRef(new Map());
  const previousOrder = useRef("");

  const resolveDefaultRating = (player) => {
    if (player.myRating !== null && player.myRating !== undefined) {
      return clampNumber(roundToTenth(Number(player.myRating)), 1, 10);
    }
    const average = Number(player.averageRating || 0);
    if (average > 0) {
      return clampNumber(roundToTenth(average), 1, 10);
    }
    return 5;
  };

  const refresh = async () => {
    try {
      const result = await apiFetch("/api/ranker/players", {}, token);
      const nextPlayers = result.players || [];
      setPlayers(nextPlayers);
      const nextDraft = {};
      const nextSaved = {};
      nextPlayers.forEach((player) => {
        const savedValue = Number(player.myRating);
        nextSaved[player.name] = Number.isFinite(savedValue) ? savedValue : 0;
        nextDraft[player.name] = resolveDefaultRating(player);
      });
      setDraftRatings(nextDraft);
      setSavedRatings(nextSaved);
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const aRating = savedRatings[a.name] ?? 0;
      const bRating = savedRatings[b.name] ?? 0;
      const aRated = aRating > 0;
      const bRated = bRating > 0;
      if (aRated !== bRated) {
        return aRated ? 1 : -1;
      }
      if (!aRated) {
        return b.averageRating - a.averageRating;
      }
      if (aRating !== bRating) {
        return bRating - aRating;
      }
      return b.averageRating - a.averageRating;
    });
  }, [players, savedRatings]);

  const orderKey = useMemo(
    () => sortedPlayers.map((player) => player.name).join("|"),
    [sortedPlayers]
  );

  useLayoutEffect(() => {
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const currentPositions = new Map();
    rowRefs.current.forEach((node, name) => {
      if (node) {
        currentPositions.set(name, node.getBoundingClientRect());
      }
    });

    const orderChanged = previousOrder.current && previousOrder.current !== orderKey;
    if (!reduceMotion && lastPositions.current.size && orderChanged) {
      currentPositions.forEach((rect, name) => {
        const previous = lastPositions.current.get(name);
        if (!previous) {
          return;
        }
        const deltaX = previous.left - rect.left;
        const deltaY = previous.top - rect.top;
        if (deltaX || deltaY) {
          const node = rowRefs.current.get(name);
          node?.animate(
            [
              { transform: `translate(${deltaX}px, ${deltaY}px)` },
              { transform: "translate(0, 0)" }
            ],
            {
              duration: 480,
              easing: "cubic-bezier(0.2, 0.9, 0.2, 1)",
              fill: "both"
            }
          );
        }
      });
    }

    lastPositions.current = currentPositions;
    previousOrder.current = orderKey;
  }, [orderKey, sortedPlayers]);

  const { visibleItems: visibleRankerPlayers } = usePaginatedList(
    sortedPlayers,
    10,
    true
  );

  const updateDraftRating = (name, value) => {
    const nextValue = roundToTenth(clampNumber(value, 1, 10));
    setDraftRatings((prev) => ({ ...prev, [name]: nextValue }));
  };

  const firstRankedIndex = sortedPlayers.findIndex(
    (player) => (savedRatings[player.name] ?? 0) > 0
  );
  const hasAnyRanked = firstRankedIndex !== -1;
  const hasAnyUnranked = sortedPlayers.some(
    (player) => (savedRatings[player.name] ?? 0) <= 0
  );
  const dimRanked = hasAnyRanked && hasAnyUnranked;

  const handleSave = async () => {
    try {
      const payload = {};
      players.forEach((player) => {
        const rawValue = draftRatings[player.name];
        const numericValue = Number.isFinite(Number(rawValue))
          ? Number(rawValue)
          : resolveDefaultRating(player);
        payload[player.name] = roundToTenth(clampNumber(numericValue, 1, 10));
      });

      await apiFetch(
        "/api/ranker/ratings",
        {
          method: "POST",
          body: JSON.stringify({ rankings: payload })
        },
        token
      );
      setNotice({ type: "success", message: "הדירוגים נשמרו" });
      await refresh();
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  return (
    <section className="section">
      <CollapsibleCard title={`ברוך הבא ${session.displayName || "מדרג"}`}>
        <div className="list">
          {visibleRankerPlayers.map((player, index) => {
            const hasRating = (savedRatings[player.name] ?? 0) > 0;
            const isGoalkeeper = player.position === "GK";
            return (
              <React.Fragment key={player.name}>
                {dimRanked && index === firstRankedIndex ? (
                  <div className="ranker-divider" aria-hidden="true" />
                ) : null}
                <div
                  className={`player-row ranker-row position-tone ${positionClass(player.position)} ${
                    hasRating ? "rated" : "unrated"
                  } ${isGoalkeeper ? "goalkeeper" : ""} ${
                    dimRanked && hasRating ? "ranker-dim" : ""
                  }`}
                  ref={(node) => {
                    if (node) {
                      rowRefs.current.set(player.name, node);
                    } else {
                      rowRefs.current.delete(player.name);
                    }
                  }}
                >
                  <div className="player-meta">
                    <strong className="player-name">
                      <span className="role-icon">
                        <PositionIcon role={player.position} />
                      </span>
                      <span>{player.name}</span>
                      <RatingBadge value={player.averageRating} />
                    </strong>
                  </div>
                  <RatingSlider
                    value={draftRatings[player.name] ?? resolveDefaultRating(player)}
                    average={player.averageRating}
                    onChange={(value) => updateDraftRating(player.name, value)}
                    disabled={isGoalkeeper}
                  />
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div className="button-row" style={{ marginTop: "16px" }}>
          <button className="button button-primary" onClick={handleSave}>
            שמור דירוגים
          </button>
        </div>
      </CollapsibleCard>
    </section>
  );
};

export default App;
