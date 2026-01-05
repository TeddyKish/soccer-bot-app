import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import shirtWhite from "./assets/shirt-white.svg";
import shirtYellow from "./assets/shirt-yellow.svg";
import shirtRed from "./assets/shirt-red.svg";

const API_BASE = "";

const positionOptions = [
  { value: "ALL", label: "כל המגרש" },
  { value: "GK", label: "שוער" },
  { value: "ATT", label: "התקפה" },
  { value: "DEF", label: "הגנה" }
];

const TEAM_COLORS = [
  { id: "white", label: "לבן" },
  { id: "yellow", label: "צהוב" },
  { id: "red", label: "אדום" }
];

const TEAM_SHIRTS = {
  white: shirtWhite,
  yellow: shirtYellow,
  red: shirtRed
};

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
const formatCash = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "₪0.00";
  }
  return `₪${numeric.toFixed(2)}`;
};
const quoteOfDay = () => {
  const quotes = [
    { text: "The more difficult the victory, the greater the happiness in winning.", author: "Pele" },
    { text: "You have to fight to reach your dream.", author: "Lionel Messi" },
    { text: "Success is no accident.", author: "Pele" },
    { text: "I learned all about life with a ball at my feet.", author: "Ronaldinho" },
    { text: "If you are first you are first. If you are second you are nothing.", author: "Bill Shankly" },
    { text: "Play for the name on the front of the shirt.", author: "Tony Adams" },
    { text: "The ball is round, the game lasts ninety minutes.", author: "Sepp Herberger" },
    { text: "Everything is practice.", author: "Pep Guardiola" },
    { text: "Football is simple, but it is difficult to play simple.", author: "Johan Cruyff" }
  ];
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now - start) / 86400000);
  const index = day % quotes.length;
  return quotes[index];
};
const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));
const roundToTenth = (value) => Math.round(value * 10) / 10;
const formatTodayDate = () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${day}-${month}-${year}`;
};
const parseDateString = (value) => {
  if (!value) {
    return null;
  }
  const parts = value.split("-");
  if (parts.length !== 3) {
    return null;
  }
  const [day, month, year] = parts.map((part) => Number(part));
  if (!day || !month || !year) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
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
  { id: "rankers", label: "מדרגים", icon: "rankers" },
  { id: "stats", label: "סטטיסטיקה", icon: "stats" }
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
    case "rankers":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 18v-2.5a4 4 0 014-4h6a4 4 0 014 4V18"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
          />
          <circle cx="12" cy="7" r="3" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <path d="M7 21h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
};

const WaterBottleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M9 2h6v2l-1 1v2h2a2 2 0 012 2v11a3 3 0 01-3 3H9a3 3 0 01-3-3V9a2 2 0 012-2h2V5l-1-1V2z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M8.5 11h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M8.5 14h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

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
    case "status":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M8.5 12.5l2.2 2.2 4.8-5.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
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
    case "entries":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="6" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6.5 10.5h9M6.5 13.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M14 4h6v12" stroke="currentColor" strokeWidth="1.6" fill="none" />
        </svg>
      );
    default:
      return null;
  }
};

const PlayerStatIcon = ({ name }) => {
  switch (name) {
    case "entries":
      return <ActionIcon name="entries" />;
    case "wins":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M7 4h10v2a5 5 0 01-5 5 5 5 0 01-5-5V4z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M5 4H3v2a4 4 0 004 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M19 4h2v2a4 4 0 01-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M9 11v3h6v-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M8 20h8" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 14v4h4v-4" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "dayWins":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 8l6-4 6 4v8a6 6 0 01-12 0V8z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M9 12l3 2 3-2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      );
    case "last":
      return <StatIcon name="date" />;
    default:
      return null;
  }
};

const GameIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M12 7l4 3-1.5 5H9.5L8 10l4-3z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M12 7v10M8 10l4 3 4-3" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
);

const PositionIcon = ({ role }) => {
  switch (role) {
    case "GK":
      return <span className="emoji-icon" aria-hidden="true">🧤</span>;
    case "DEF":
      return <span className="emoji-icon" aria-hidden="true">🛡️</span>;
    case "ATT":
      return <span className="emoji-icon" aria-hidden="true">🎯</span>;
    case "ALL":
      return <span className="emoji-icon" aria-hidden="true">⚪️</span>;
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
  }
};

const PositionPicker = ({ value, onChange, disabled = false }) => (
  <div className={`position-picker ${disabled ? "disabled" : ""}`}>
    {positionOptions.map((option) => (
      <button
        key={option.value}
        type="button"
        className={`position-pill ${positionClass(option.value)} ${
          value === option.value ? "active" : ""
        }`}
        onClick={(event) => {
          event.preventDefault();
          if (!disabled) {
            onChange(option.value);
          }
        }}
        disabled={disabled}
      >
        <span className="role-icon">
          <PositionIcon role={option.value} />
        </span>
        <span>{option.label}</span>
      </button>
    ))}
  </div>
);

const SuggestInput = ({
  value,
  onChange,
  options = [],
  placeholder,
  className = ""
}) => {
  const [open, setOpen] = useState(false);
  const normalizedValue = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!options.length) {
      return [];
    }
    const matches = normalizedValue
      ? options.filter((option) =>
          option.toLowerCase().includes(normalizedValue)
        )
      : options;
    return matches.slice(0, 6);
  }, [options, normalizedValue]);

  return (
    <div className={`suggest-input ${className}`}>
      <input
        className="input"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
      />
      {open && filtered.length ? (
        <div className="suggest-list" role="listbox">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              className="suggest-item"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(option);
                setOpen(false);
              }}
              onTouchStart={(event) => {
                event.preventDefault();
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
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

const RatingBadge = ({ value, className = "" }) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }
  if (numericValue > 7) {
    return (
      <span className={`rating-badge rating-badge-star ${className}`} title="שחקן מוביל">
        <BadgeIcon name="star" />
        <span className="sr-only">שחקן מוביל</span>
      </span>
    );
  }
  if (numericValue <= 4) {
    return (
      <span className={`rating-badge rating-badge-carpenter ${className}`} title="צריך חיזוק">
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
  valueStyle = null,
  showValue = true,
  showBubble = false
}) => {
  const percent = clampNumber(((Number(value) - 1) / 9) * 100, 0, 100);
  const bubblePercent = clampNumber(percent, 5, 95);
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
        {showBubble ? (
          <span
            className="slider-bubble"
            style={{ left: `${bubblePercent}%` }}
          >
            {Number(value).toFixed(1)}
          </span>
        ) : null}
      </div>
      {showValue ? (
        <span className="slider-value" style={valueStyle}>
          {Number(value).toFixed(1)}
        </span>
      ) : null}
    </div>
  );
};

const usePaginatedList = (items, pageSize = 10, autoLoad = false, threshold = 220) => {
  const [visible, setVisible] = useState(pageSize);

  useEffect(() => {
    setVisible(pageSize);
  }, [items.length, pageSize]);

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
  titleAction = null,
  className = ""
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;
  return (
    <div
      className={`card collapsible card-animated ${isOpen ? "open" : "collapsed"} ${className}`}
    >
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
      <button
        className="button button-secondary landing-button"
        type="button"
        onClick={() => {
          window.location.href = "/general";
        }}
      >
        נתונים כלליים
      </button>
    </div>
  </section>
);

const Modal = ({ open, children, className = "", onClose }) => {
  const [rendered, setRendered] = useState(open);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      const frame = window.requestAnimationFrame(() => setActive(true));
      return () => window.cancelAnimationFrame(frame);
    }
    if (rendered) {
      setActive(false);
      const timer = window.setTimeout(() => setRendered(false), 220);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open, rendered]);

  if (!rendered) {
    return null;
  }

  return createPortal(
    <div
      className={`modal-overlay ${active ? "active" : ""}`}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`modal-card ${className}`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

const GeneralData = ({
  setNotice,
  statsEndpoint = "/api/public/statistics",
  matchdayEndpoint = "/api/public/matchday/",
  showPlayerRatings = false,
  showAverageRating = false,
  openMatchdayDate = null,
  authToken = null
}) => {
  const [statistics, setStatistics] = useState({
    overview: null,
    players: [],
    matchdays: []
  });
  const [playerSearch, setPlayerSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [detailMatchday, setDetailMatchday] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [matchdayPage, setMatchdayPage] = useState(1);
  const [inactiveDays, setInactiveDays] = useState("60");

  const pageSize = 8;
  const totalPages = Math.max(
    1,
    Math.ceil((statistics.matchdays || []).length / pageSize)
  );
  const pageSafe = Math.min(Math.max(matchdayPage, 1), totalPages);
  const pagedMatchdays = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return (statistics.matchdays || []).slice(start, start + pageSize);
  }, [statistics.matchdays, pageSafe]);
  const filteredPlayers = useMemo(() => {
    const term = playerSearch.trim().toLowerCase();
    const base = statistics.players || [];
    const filtered = term
      ? base.filter((player) => (player.name || "").toLowerCase().includes(term))
      : base;
    return [...filtered].sort(
      (a, b) => (b.dayWins ?? 0) - (a.dayWins ?? 0)
    );
  }, [statistics.players, playerSearch]);
  const inactivePlayers = useMemo(() => {
    const threshold = Number(inactiveDays);
    const limit = Number.isFinite(threshold) && threshold > 0 ? threshold : 60;
    const now = new Date();
    return (statistics.players || []).filter((player) => {
      const lastAppearance = parseDateString(player.lastAppearance);
      if (!lastAppearance) {
        return true;
      }
      const diffDays = Math.floor((now - lastAppearance) / 86400000);
      return diffDays > limit;
    });
  }, [statistics.players, inactiveDays]);
  const debtPlayers = useMemo(
    () => (statistics.players || []).filter((player) => (player.entryCount ?? 0) <= 0),
    [statistics.players]
  );

  useEffect(() => {
    if (pageSafe !== matchdayPage) {
      setMatchdayPage(pageSafe);
    }
  }, [pageSafe, matchdayPage]);

  useEffect(() => {
    apiFetch(statsEndpoint, {}, authToken)
      .then((data) => {
        setStatistics({
          overview: data.overview || null,
          players: data.players || [],
          matchdays: data.matchdays || []
        });
      })
      .catch((error) => {
        setNotice({ type: "error", message: error.message });
      });
  }, []);

  const handleMatchdayOpen = async (dateValue) => {
    if (!dateValue) {
      return;
    }
    try {
      const result = await apiFetch(
        `${matchdayEndpoint}${encodeURIComponent(dateValue)}`,
        {},
        authToken
      );
      setDetailMatchday(result.matchday);
      setDetailOpen(true);
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  useEffect(() => {
    if (openMatchdayDate) {
      handleMatchdayOpen(openMatchdayDate);
    }
  }, [openMatchdayDate]);

  return (
    <section className="section">
      <div className="stats-shell">
        <div className="admin-nav">
          <button
            className={`nav-button ${activeTab === "overview" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("overview")}
          >
            <span className="nav-text">
              <span className="nav-label">נתונים כלליים</span>
            </span>
          </button>
          <button
            className={`nav-button ${activeTab === "players" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("players")}
          >
            <span className="nav-text">
              <span className="nav-label">שחקנים</span>
            </span>
          </button>
          <button
            className={`nav-button ${activeTab === "games" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("games")}
          >
            <span className="nav-text">
              <span className="nav-label">משחקים</span>
            </span>
          </button>
          <button
            className={`nav-button ${activeTab === "inactive" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("inactive")}
          >
            <span className="nav-text">
              <span className="nav-label">לא שיחקו מעל 60 ימים</span>
            </span>
          </button>
          <button
            className={`nav-button ${activeTab === "debts" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("debts")}
          >
            <span className="nav-text">
              <span className="nav-label">חובות</span>
            </span>
          </button>
        </div>
        {activeTab === "overview" && (
          <CollapsibleCard title="נתונים כלליים">
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
                <span>משחק אחרון</span>
                <strong>{statistics.overview?.lastMatchDate || "לא ידוע"}</strong>
              </div>
            </div>
          </CollapsibleCard>
        )}
        {activeTab === "players" && (
          <CollapsibleCard title="הופעות לפי שחקן">
            <div className="player-toolbar">
              <input
                className="input input-compact"
                value={playerSearch}
                onChange={(event) => setPlayerSearch(event.target.value)}
                placeholder="חיפוש שחקן"
              />
            </div>
            <div className="player-stats-grid">
              {filteredPlayers.length ? (
                filteredPlayers.map((player, index) => {
                  const entryValue =
                    player.entryCount === null || player.entryCount === undefined
                      ? "—"
                      : player.entryCount;
                  const entryDisplay =
                    entryValue === "—" ? (
                      entryValue
                    ) : (
                      <span className="ltr-num">{entryValue}</span>
                    );
                  const entryClass =
                    entryValue === "—"
                      ? ""
                      : player.entryCount < 0
                        ? "entry-negative"
                        : player.entryCount === 0
                          ? "entry-zero"
                          : "entry-positive";
                  return (
                    <div
                      className="player-stat-card"
                      key={player.name}
                      style={{ animationDelay: `${index * 0.04}s` }}
                    >
                      <div className="player-stat-name">{player.name}</div>
                      <div className="player-stat-items">
                        <div className={`player-stat-chip ${entryClass}`}>
                          <span className="player-stat-icon">
                            <PlayerStatIcon name="entries" />
                          </span>
                          <strong className="player-stat-value">{entryDisplay}</strong>
                          <span className="player-stat-label">כניסות</span>
                        </div>
                        <div className="player-stat-chip">
                          <span className="player-stat-icon">
                            <PlayerStatIcon name="wins" />
                          </span>
                          <strong className="player-stat-value">{player.wins ?? 0}</strong>
                          <span className="player-stat-label">ניצחונות</span>
                        </div>
                        <div className="player-stat-chip">
                          <span className="player-stat-icon">
                            <PlayerStatIcon name="dayWins" />
                          </span>
                          <strong className="player-stat-value">{player.dayWins ?? 0}</strong>
                          <span className="player-stat-label">אליפויות</span>
                        </div>
                        <div className="player-stat-chip">
                          <span className="player-stat-icon">
                            <PlayerStatIcon name="last" />
                          </span>
                          <strong className="player-stat-value">
                            {player.lastAppearance || "לא ידוע"}
                          </strong>
                          <span className="player-stat-label">הופעה אחרונה</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="notice">אין נתונים עדיין</div>
              )}
            </div>
          </CollapsibleCard>
        )}
        {activeTab === "games" && (
          <CollapsibleCard title="משחקים אחרונים">
            <div className="list">
              {statistics.matchdays.length ? (
                pagedMatchdays.map((entry) => (
                  <button
                    className="stats-game-card"
                    type="button"
                    key={`${entry.date}-${entry.location}`}
                    onClick={() => handleMatchdayOpen(entry.date)}
                  >
                    <span className="stats-game-icon" aria-hidden="true">
                      <GameIcon />
                    </span>
                    <span className="stats-game-content">
                      <strong>{entry.location || "ללא מיקום"}</strong>
                      <span className="stats-game-meta">
                        {entry.date || "ללא תאריך"}
                      </span>
                      <span className="stats-game-line" aria-hidden="true" />
                    </span>
                  </button>
                ))
              ) : (
                <div className="notice">אין משחקים מתועדים</div>
              )}
            </div>
            <div className="cash-log-pagination">
              <button
                className="button button-secondary"
                type="button"
                disabled={pageSafe <= 1}
                onClick={() => setMatchdayPage(pageSafe - 1)}
              >
                קודם
              </button>
              <span className="cash-log-page">
                עמוד {pageSafe} מתוך {totalPages}
              </span>
              <button
                className="button button-secondary"
                type="button"
                disabled={pageSafe >= totalPages}
                onClick={() => setMatchdayPage(pageSafe + 1)}
              >
                הבא
              </button>
            </div>
          </CollapsibleCard>
        )}
        {activeTab === "inactive" && (
          <CollapsibleCard title="לא שיחקו מעל X ימים">
            <div className="player-toolbar">
              <input
                className="input input-compact"
                type="number"
                min="1"
                value={inactiveDays}
                onChange={(event) => setInactiveDays(event.target.value)}
                placeholder="מספר ימים"
              />
            </div>
            <div className="player-stats-grid">
              {inactivePlayers.length ? (
                inactivePlayers.map((player, index) => {
                  const entryValue =
                    player.entryCount === null || player.entryCount === undefined
                      ? "—"
                      : player.entryCount;
                  const entryDisplay =
                    entryValue === "—" ? (
                      entryValue
                    ) : (
                      <span className="ltr-num">{entryValue}</span>
                    );
                  const entryClass =
                    entryValue === "—"
                      ? ""
                      : player.entryCount < 0
                        ? "entry-negative"
                        : player.entryCount === 0
                          ? "entry-zero"
                          : "entry-positive";
                  return (
                    <div
                      className="player-stat-card"
                      key={`${player.name}-inactive`}
                      style={{ animationDelay: `${index * 0.04}s` }}
                    >
                      <div className="player-stat-name">{player.name}</div>
                      <div className="player-stat-items">
                        <div className={`player-stat-chip ${entryClass}`}>
                          <span className="player-stat-icon">
                            <PlayerStatIcon name="entries" />
                          </span>
                          <strong className="player-stat-value">{entryDisplay}</strong>
                          <span className="player-stat-label">כניסות</span>
                        </div>
                        <div className="player-stat-chip">
                          <span className="player-stat-icon">
                            <PlayerStatIcon name="last" />
                          </span>
                          <strong className="player-stat-value">
                            {player.lastAppearance || "לא ידוע"}
                          </strong>
                          <span className="player-stat-label">הופעה אחרונה</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="notice">אין שחקנים ברשימה</div>
              )}
            </div>
          </CollapsibleCard>
        )}
        {activeTab === "debts" && (
          <CollapsibleCard title="חובות">
            <div className="player-stats-grid">
              {debtPlayers.length ? (
                debtPlayers.map((player, index) => {
                  const entryValue =
                    player.entryCount === null || player.entryCount === undefined
                      ? "—"
                      : player.entryCount;
                  const entryDisplay =
                    entryValue === "—" ? (
                      entryValue
                    ) : (
                      <span className="ltr-num">{entryValue}</span>
                    );
                  const entryClass =
                    entryValue === "—"
                      ? ""
                      : player.entryCount < 0
                        ? "entry-negative"
                        : player.entryCount === 0
                          ? "entry-zero"
                          : "entry-positive";
                  return (
                    <div
                      className="player-stat-card"
                      key={`${player.name}-debt`}
                      style={{ animationDelay: `${index * 0.04}s` }}
                    >
                      <div className="player-stat-name">{player.name}</div>
                      <div className="player-stat-items">
                        <div className={`player-stat-chip ${entryClass}`}>
                          <span className="player-stat-icon">
                            <PlayerStatIcon name="entries" />
                          </span>
                          <strong className="player-stat-value">{entryDisplay}</strong>
                          <span className="player-stat-label">כניסות</span>
                        </div>
                        <div className="player-stat-chip">
                          <span className="player-stat-icon">
                            <PlayerStatIcon name="last" />
                          </span>
                          <strong className="player-stat-value">
                            {player.lastAppearance || "לא ידוע"}
                          </strong>
                          <span className="player-stat-label">הופעה אחרונה</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="notice">אין חובות כרגע</div>
              )}
            </div>
          </CollapsibleCard>
        )}
      </div>

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)}>
        <div className="modal-header-row">
          <div className="modal-header">פרטי משחק</div>
          <button
            className="icon-button"
            type="button"
            onClick={() => setDetailOpen(false)}
          >
            X
          </button>
        </div>
        <div className="modal-body">
          {detailMatchday ? (
            <div className="stack">
              <div className="stat-grid">
                <div className="stat-card compact">
                  <span className="stat-icon" aria-hidden="true">
                    <StatIcon name="date" />
                  </span>
                  <strong>{detailMatchday.date || "לא ידוע"}</strong>
                </div>
                <div className="stat-card compact">
                  <span className="stat-icon" aria-hidden="true">
                    <StatIcon name="time" />
                  </span>
                  <strong>{detailMatchday.time || "לא ידוע"}</strong>
                </div>
                <div className="stat-card compact">
                  <span className="stat-icon" aria-hidden="true">
                    <StatIcon name="location" />
                  </span>
                  <strong>{detailMatchday.location || "לא ידוע"}</strong>
                </div>
                {detailMatchday.waterCarrier ? (
                  <div className="stat-card compact water-stat">
                    <span className="stat-icon" aria-hidden="true">
                      <WaterBottleIcon />
                    </span>
                    <strong>מים: {detailMatchday.waterCarrier}</strong>
                  </div>
                ) : null}
              </div>
              <div className="stats-matchday-teams">
                <div className="section-subtitle">חלוקת קבוצות</div>
                <GroupsColumns
                  teams={detailMatchday.teams || []}
                  colors={(detailMatchday.teams || []).map(
                    (team, index) =>
                      team.color || TEAM_COLORS[index % TEAM_COLORS.length].id
                  )}
                  winners={detailMatchday.winners || []}
                  onPickColor={() => {}}
                  activePicker={null}
                  onTogglePicker={() => {}}
                  readOnly
                  showPlayerRatings={showPlayerRatings}
                  showAverageRating={showAverageRating}
                />
              </div>
            </div>
          ) : (
            <div className="notice">לא נמצאו פרטי משחק</div>
          )}
        </div>
      </Modal>
    </section>
  );
};

const App = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState([]);
  const [authMode, setAuthMode] = useState(null);
  const isGeneralData = window.location.pathname.startsWith("/general");

  const pushNotice = (notice) => {
    if (!notice) {
      return;
    }
    const id = `${Date.now()}-${Math.random()}`;
    setNotices([{ id, ...notice }]);
    window.setTimeout(() => {
      setNotices((prev) => prev.filter((item) => item.id !== id));
    }, 2000);
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

  useEffect(() => {
    const keepInputVisible = (element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      const tag = element.tagName;
      if (!["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        return;
      }
      const rect = element.getBoundingClientRect();
      const viewHeight =
        window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight;
      const margin = 12;
      if (rect.top < margin) {
        window.scrollBy({ top: rect.top - margin, behavior: "auto" });
      } else if (rect.bottom > viewHeight - margin) {
        window.scrollBy({ top: rect.bottom - (viewHeight - margin), behavior: "auto" });
      }
    };
    const handleFocus = (event) => {
      const target = event.target;
      window.requestAnimationFrame(() => keepInputVisible(target));
      window.setTimeout(() => keepInputVisible(target), 120);
      window.setTimeout(() => keepInputVisible(target), 240);
    };
    const handleViewportResize = () => {
      keepInputVisible(document.activeElement);
    };
    window.addEventListener("focusin", handleFocus);
    window.visualViewport?.addEventListener("resize", handleViewportResize);
    return () => {
      window.removeEventListener("focusin", handleFocus);
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
    };
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
      {isGeneralData ? (
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
              <div className="title">נתונים כלליים</div>
              <div className="subtitle">סיכומי משחקים, הופעות וניצחונות.</div>
            </div>
          </div>
          <div className="card session-card">
            <div className="session-name">גישה ציבורית</div>
            <div className="button-row">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                חזרה
              </button>
            </div>
          </div>
        </header>
      ) : session ? (
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
              <div className="title">גרי רביעי ושבת</div>
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

      {isGeneralData ? (
        <GeneralData setNotice={pushNotice} />
      ) : !session ? (
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
  const [rankerToken, setRankerToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (mode === "admin") {
        await onLogin("admin", adminPassword);
      } else {
        await onLogin("ranker", rankerToken);
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
              <label>טוקן מדרג</label>
              <input
                className="input"
                type="password"
                value={rankerToken}
                onChange={(event) => setRankerToken(event.target.value)}
                placeholder="הזן טוקן"
              />
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

const TeamRoster = ({ players, compact = false }) => {
  const orderedPlayers = [...players].sort(comparePlayersByRating);
  if (compact) {
    return (
      <div className="team-roster-inline">
        {orderedPlayers.map((player) => (
          <span
            key={player.name}
            className={`team-inline-player ${positionClass(player.position)}`}
          >
            <span className="role-icon">
              <PositionIcon role={player.position} />
            </span>
            <span>{player.name}</span>
            <span className="team-inline-rating">
              {formatRating(player.averageRating)}
            </span>
          </span>
        ))}
      </div>
    );
  }
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
              {player.isGuest ? (
                <span className="guest-inline">
                  {player.invitedBy ? `${player.invitedBy} - אורח` : "אורח"}
                </span>
              ) : null}
              <RatingBadge value={player.averageRating} />
            </strong>
            <span className="chip rating-chip">
              {formatRating(player.averageRating)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const GroupsColumns = ({
  teams,
  colors,
  onPickColor,
  activePicker,
  onTogglePicker,
  readOnly = false,
  showPlayerRatings = true,
  showAverageRating = true,
  winners = []
}) => (
  <div className="groups-bubble">
    {teams.map((team, index) => {
      const colorId = colors[index];
      const orderedPlayers = [...team.players].sort(comparePlayersByRating);
      const isWinner = winners.includes(index);
      const showWins = readOnly;
      return (
        <div className="group-column" key={`group-${index}`}>
          <div className="group-header">
            <button
              className={`team-shirt-button${isWinner ? " winner-glow" : ""}`}
              type="button"
              onClick={() => onTogglePicker(index)}
              disabled={readOnly}
            >
              <img src={TEAM_SHIRTS[colorId]} alt={colorId} />
            </button>
            {activePicker === index && !readOnly ? (
              <div className="team-color-picker">
                {TEAM_COLORS.map((color) => (
                  <button
                    key={`${index}-${color.id}`}
                    type="button"
                    className="team-color-choice"
                    onClick={() => onPickColor(index, color.id)}
                  >
                    <img src={TEAM_SHIRTS[color.id]} alt={color.label} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {showAverageRating ? (
            <div className="group-rating">
              ממוצע: {formatRating(team.averageRating ?? team.rating)}
            </div>
          ) : null}
          {showWins ? (
            <div className="group-rating">
              {team.wins ?? 0} ניצחונות
            </div>
          ) : null}
          <div className="group-player-list">
            {orderedPlayers.map((player) => (
              <div
                className={`group-player position-tone ${positionClass(player.position)}`}
                key={`${index}-${player.name}`}
              >
                <span className="role-icon">
                  <PositionIcon role={player.position} />
                </span>
                <span className="group-player-name">{player.name}</span>
                {showPlayerRatings ? (
                  <span className="group-player-rating">
                    {formatRating(player.averageRating)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          {index < teams.length - 1 ? <div className="group-separator" /> : null}
        </div>
      );
    })}
  </div>
);

const AdminDashboard = ({ session, setNotice }) => {
  const token = session.token;
  const [players, setPlayers] = useState([]);
  const [matchday, setMatchday] = useState(null);
  const [settings, setSettings] = useState(null);
  const [constraints, setConstraints] = useState({ couplings: [], decouplings: [] });
  const [activeTab, setActiveTab] = useState("matches");
  const [importMessage, setImportMessage] = useState("");
  const [playerModal, setPlayerModal] = useState(null);
  const [playerImportOpen, setPlayerImportOpen] = useState(false);
  const [playerImportMessage, setPlayerImportMessage] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [guestSetup, setGuestSetup] = useState(null);
  const [matchdayEdit, setMatchdayEdit] = useState(null);
  const [constraintGroups, setConstraintGroups] = useState([]);
  const [draggingPlayer, setDraggingPlayer] = useState(null);
  const [mergePulse, setMergePulse] = useState(null);
  const [rankers, setRankers] = useState([]);
  const [rankerTokenName, setRankerTokenName] = useState("");
  const [issuedToken, setIssuedToken] = useState(null);
  const [issuingToken, setIssuingToken] = useState(false);
  const [cashBalance, setCashBalance] = useState(0);
  const [cashLogs, setCashLogs] = useState([]);
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [cashMode, setCashMode] = useState("choice");
  const [cashExpenseAmount, setCashExpenseAmount] = useState("");
  const [cashExpenseReason, setCashExpenseReason] = useState("");
  const [cashIncomePlayer, setCashIncomePlayer] = useState("");
  const [cashIncomeEntries, setCashIncomeEntries] = useState("");
  const [cashIncomeAmount, setCashIncomeAmount] = useState("");
  const [cashLogPage, setCashLogPage] = useState(1);
  const [cashGuestTasks, setCashGuestTasks] = useState([]);
  const [guestPaymentModal, setGuestPaymentModal] = useState(null);
  const [guestPaymentMode, setGuestPaymentMode] = useState("choice");
  const [guestPaymentAmount, setGuestPaymentAmount] = useState("");
  const [guestPaymentPayer, setGuestPaymentPayer] = useState("");
  const [confirmState, setConfirmState] = useState(null);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [finishTeamWins, setFinishTeamWins] = useState([]);
  const [finishWaterCarrier, setFinishWaterCarrier] = useState("");
  const [adminStatsMatchdayDate, setAdminStatsMatchdayDate] = useState(null);
  const [teamColorPicker, setTeamColorPicker] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const touchDraggingRef = useRef(false);
  const dragPointerIdRef = useRef(null);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia?.("(max-width: 600px)")?.matches ?? false
  );

  const hasModalOpen = Boolean(
    playerModal ||
      playerImportOpen ||
      guestSetup?.open ||
      matchdayEdit ||
      confirmState ||
      cashModalOpen ||
      guestPaymentModal ||
      finishModalOpen
  );

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
  const rankerPlayerList = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name)),
    [players]
  );
  const teamColors = useMemo(() => {
    const defaultColors = TEAM_COLORS.map((color) => color.id);
    if (!matchday?.teams?.length) {
      return [];
    }
    return matchday.teams.map(
      (team, index) => team.color || defaultColors[index % defaultColors.length]
    );
  }, [matchday]);
  const matchdayParticipantCount = useMemo(() => {
    if (!matchday) {
      return 0;
    }
    const rosterNames = matchday.roster || [];
    const guestNames = (matchday.guests || []).map((guest) => guest.name);
    return new Set([...rosterNames, ...guestNames].filter(Boolean)).size;
  }, [matchday]);
  const sortedRankers = useMemo(
    () =>
      [...rankers].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
      ),
    [rankers]
  );
  const cashPageSize = 10;
  const cashTotalPages = Math.max(1, Math.ceil(cashLogs.length / cashPageSize));
  const cashPage = Math.min(Math.max(cashLogPage, 1), cashTotalPages);
  const pagedCashLogs = useMemo(() => {
    const start = (cashPage - 1) * cashPageSize;
    return cashLogs.slice(start, start + cashPageSize);
  }, [cashLogs, cashPage]);

  useEffect(() => {
    if (cashLogPage !== cashPage) {
      setCashLogPage(cashPage);
    }
  }, [cashPage, cashLogPage]);

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
  const waterCarrierOptions = useMemo(
    () => rosterList.filter((player) => !player.isGuest).map((player) => player.name),
    [rosterList]
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


  const refreshAll = async () => {
    try {
      const [playersRes, matchdayRes, settingsRes, constraintsRes, rankersRes, cashRes] =
        await Promise.all([
          apiFetch("/api/admin/players", {}, token),
          apiFetch("/api/admin/matchday/today", {}, token),
          apiFetch("/api/admin/settings", {}, token),
          apiFetch("/api/admin/constraints", {}, token).catch(() => ({
            couplings: [],
            decouplings: []
          })),
          apiFetch("/api/admin/rankers", {}, token).catch(() => ({ rankers: [] })),
          apiFetch("/api/admin/cash", {}, token).catch(() => ({ balance: 0, logs: [] }))
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
      setRankers(rankersRes.rankers || []);
      setCashBalance(cashRes.balance ?? 0);
      setCashLogs(cashRes.logs || []);
      setCashGuestTasks(cashRes.guestTasks || []);
      if (!nextMatchday) {
        setConstraintGroups([]);
        setMergePulse(null);
        setMatchdayEdit(null);
      }
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  const refreshCash = async () => {
    try {
      const cashRes = await apiFetch("/api/admin/cash", {}, token);
      setCashBalance(cashRes.balance ?? 0);
      setCashLogs(cashRes.logs || []);
      setCashGuestTasks(cashRes.guestTasks || []);
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 600px)");
    if (!media) {
      return undefined;
    }
    const handleChange = (event) => setIsMobile(event.matches);
    handleChange(media);
    if (media.addEventListener) {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
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

  useEffect(() => {
    if (!draggingPlayer) {
      return undefined;
    }
    const handleMove = (event) => {
      const touch = event.touches?.[0];
      if (!touch) {
        return;
      }
      event.preventDefault();
      setDragGhost((prev) =>
        prev
          ? {
              ...prev,
              x: touch.clientX,
              y: touch.clientY
            }
          : prev
      );
    };
    const handleEnd = (event) => {
      const touch = event.changedTouches?.[0];
      if (touch) {
        handleDropAt(touch.clientX, touch.clientY);
      }
      setDraggingPlayer(null);
      setDragGhost(null);
      touchDraggingRef.current = false;
      dragPointerIdRef.current = null;
    };
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);
    window.addEventListener("touchcancel", handleEnd);
    return () => {
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
      window.removeEventListener("touchcancel", handleEnd);
    };
  }, [draggingPlayer]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", hasModalOpen);
    return () => document.body.classList.remove("modal-open");
  }, [hasModalOpen]);


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
          body: JSON.stringify({
            name: player.name,
            position: player.position,
            entryCount: 0
          })
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
          body: JSON.stringify({
            position: player.position
          })
        },
        token
      );
      const positionLabel =
        positionOptions.find((option) => option.value === player.position)?.label ||
        player.position;
      setPlayers((prev) =>
        prev.map((item) =>
          item.name === player.name ? { ...item, position: player.position } : item
        )
      );
      setMatchday((prev) => {
        if (!prev) {
          return prev;
        }
        const rosterDetails = (prev.rosterDetails || []).map((entry) =>
          entry.name === player.name
            ? {
                ...entry,
                position: player.position,
                positionLabel
              }
            : entry
        );
        const teams = (prev.teams || []).map((team) => ({
          ...team,
          players: (team.players || []).map((entry) =>
            entry.name === player.name
              ? {
                  ...entry,
                  position: player.position,
                  positionLabel
                }
              : entry
          )
        }));
        return { ...prev, rosterDetails, teams };
      });
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
    setConfirmState({
      title: "מחיקת שחקן",
      message: `האם למחוק את ${name}?`,
      confirmLabel: "מחיקה",
      onConfirm: async () => {
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
        } finally {
          setConfirmState(null);
        }
      }
    });
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

  const handleImportPlayers = async () => {
    if (!playerImportMessage.trim()) {
      setNotice({ type: "error", message: "יש להזין רשימת שחקנים" });
      return;
    }
    try {
      const result = await apiFetch(
        "/api/admin/players/import",
        {
          method: "POST",
          body: JSON.stringify({ message: playerImportMessage })
        },
        token
      );
      await refreshAll();
      setPlayerImportOpen(false);
      setPlayerImportMessage("");
      setNotice({ type: "success", message: `יובאו ${result.imported} שחקנים` });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
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
    const todayValue = formatTodayDate();
    if (!result.matchday || result.matchday.date !== todayValue) {
      setNotice({ type: "error", message: "התאריך שונה מהיום, נסו שוב" });
      return;
    }
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

  const handleFinishMatchday = async () => {
    if (!matchday) {
      setNotice({ type: "error", message: "אין משחק לסיום" });
      return;
    }
    if (matchday.finalized) {
      setNotice({ type: "error", message: "המשחק כבר נסגר" });
      return;
    }
    const wins = matchday.teams?.map((team) => team.wins ?? 0) || [];
    setFinishTeamWins(wins);
    setFinishWaterCarrier("");
    setFinishModalOpen(true);
  };

  const handleConfirmFinishMatchday = async () => {
    if (!matchday) {
      setNotice({ type: "error", message: "אין משחק לסיום" });
      return;
    }
    if (matchday.finalized) {
      setNotice({ type: "error", message: "המשחק כבר נסגר" });
      return;
    }
    if (!finishWaterCarrier.trim()) {
      setNotice({ type: "error", message: "יש לבחור שחקן להבאת מים" });
      return;
    }
    try {
      const result = await apiFetch(
        "/api/admin/matchday/finish",
        {
          method: "POST",
          body: JSON.stringify({
            teamWins: finishTeamWins,
            waterCarrierName: finishWaterCarrier.trim()
          })
        },
        token
      );
      setMatchday(result.matchday);
      await refreshAll();
      setFinishModalOpen(false);
      setActiveTab("stats");
      setAdminStatsMatchdayDate(result.matchday?.date || null);
      setNotice({ type: "success", message: "המשחק נסגר והכניסות עודכנו" });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  const handleTeamColorChange = async (teamIndex, colorId) => {
    if (!matchday?.teams?.length) {
      return;
    }
    const enforceUnique = TEAM_COLORS.length >= teamColors.length;
    const nextColors = teamColors.map((color) => color);
    const previousColor = nextColors[teamIndex];
    nextColors[teamIndex] = colorId;
    if (enforceUnique && previousColor !== colorId) {
      const conflictIndex = nextColors.findIndex(
        (color, index) => index !== teamIndex && color === colorId
      );
      if (conflictIndex !== -1) {
        nextColors[conflictIndex] = previousColor;
      }
    }
    try {
      const result = await apiFetch(
        "/api/admin/matchday/teams/colors",
        { method: "POST", body: JSON.stringify({ colors: nextColors }) },
        token
      );
      setMatchday(result.matchday);
      setTeamColorPicker(null);
      await refreshAll();
      setNotice({ type: "success", message: "צבעי החולצות עודכנו" });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };


  const handleCashExpense = async () => {
    const amount = Number(cashExpenseAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice({ type: "error", message: "יש להזין סכום הוצאה תקין" });
      return;
    }
    if (!cashExpenseReason.trim()) {
      setNotice({ type: "error", message: "חובה להזין סיבה להוצאה" });
      return;
    }
    try {
      const result = await apiFetch(
        "/api/admin/cash",
        {
          method: "PATCH",
          body: JSON.stringify({
            delta: -Math.abs(amount),
            reason: cashExpenseReason.trim()
          })
        },
        token
      );
      setCashExpenseAmount("");
      setCashExpenseReason("");
      setCashBalance(result.balance ?? cashBalance);
      await refreshCash();
      setNotice({ type: "success", message: "ההוצאה נרשמה" });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  const handleCashIncome = async () => {
    const amount = Number(cashIncomeAmount);
    const entries = Number(cashIncomeEntries);
    if (!cashIncomePlayer) {
      setNotice({ type: "error", message: "יש לבחור שחקן" });
      return;
    }
    if (!Number.isFinite(entries) || entries <= 0) {
      setNotice({ type: "error", message: "יש להזין מספר כניסות תקין" });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice({ type: "error", message: "יש להזין סכום הכנסה תקין" });
      return;
    }
    const player = players.find((item) => item.name === cashIncomePlayer);
    if (!player) {
      setNotice({ type: "error", message: "השחקן לא נמצא" });
      return;
    }
    try {
      const cashResult = await apiFetch(
        "/api/admin/cash/income",
        {
          method: "POST",
          body: JSON.stringify({
            playerName: player.name,
            entries: Math.trunc(entries),
            amount: Math.abs(amount)
          })
        },
        token
      );
      setCashIncomePlayer("");
      setCashIncomeEntries("");
      setCashIncomeAmount("");
      setCashBalance(cashResult.balance ?? cashBalance);
      await refreshCash();
      setNotice({ type: "success", message: "ההכנסה נרשמה והכניסות עודכנו" });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    }
  };

  const handleRemoveMatchday = async () => {
    setConfirmState({
      title: "מחיקת משחק",
      message: "האם למחוק את המשחק של היום?",
      confirmLabel: "מחיקה",
      onConfirm: async () => {
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
        } finally {
          setConfirmState(null);
        }
      }
    });
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

  const handleCopyEntries = async () => {
    if (!sortedPlayers.length) {
      setNotice({ type: "error", message: "אין שחקנים לייצוא" });
      return;
    }
    const lines = sortedPlayers.map(
      (player, index) =>
        `${index + 1}. ${player.name} (${player.positionLabel}) - ${player.entryCount ?? 0}`
    );
    const message = `יתרות כניסות:\n${lines.join("\n")}`;
    try {
      await copyTextToClipboard(message);
      setNotice({ type: "success", message: "יתרות הכניסות הועתקו ללוח" });
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

  const handleDropAt = (x, y) => {
    if (!draggingPlayer) {
      return;
    }
    const target = document.elementFromPoint(x, y);
    const dropTarget = target?.closest?.("[data-drop]");
    if (dropTarget) {
      const dropType = dropTarget.getAttribute("data-drop");
      if (dropType === "group") {
        const key = dropTarget.getAttribute("data-group-key");
        if (key) {
          handleGroupDrop(draggingPlayer, key);
        }
      } else if (dropType === "member") {
        const name = dropTarget.getAttribute("data-member-name");
        if (name) {
          handleConstraintDrop(draggingPlayer, name);
        }
      } else if (dropType === "roster") {
        handleConstraintRemove(draggingPlayer);
      }
    }
  };

  const startTouchDrag = (name, event) => {
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    const rect = event.currentTarget?.getBoundingClientRect?.();
    const entry = rosterList.find((player) => player.name === name);
    touchDraggingRef.current = true;
    const offsetX = touch && rect ? touch.clientX - rect.left : 0;
    const offsetY = touch && rect ? touch.clientY - rect.top : 0;
    setDraggingPlayer(name);
    setDragGhost({
      name,
      position: entry?.position || "ALL",
      averageRating: entry?.averageRating ?? 0,
      isGuest: entry?.isGuest ?? false,
      invitedBy: entry?.invitedBy,
      x: touch?.clientX ?? (rect ? rect.left + rect.width / 2 : 0),
      y: touch?.clientY ?? (rect ? rect.top + rect.height / 2 : 0),
      offsetX,
      offsetY
    });
  };

  const startPointerDrag = (name, event) => {
    if (event.pointerType !== "touch") {
      return;
    }
    event.preventDefault();
    dragPointerIdRef.current = event.pointerId;
    const rect = event.currentTarget?.getBoundingClientRect?.();
    const offsetX = rect ? event.clientX - rect.left : 0;
    const offsetY = rect ? event.clientY - rect.top : 0;
    const entry = rosterList.find((player) => player.name === name);
    touchDraggingRef.current = true;
    setDraggingPlayer(name);
    setDragGhost({
      name,
      position: entry?.position || "ALL",
      averageRating: entry?.averageRating ?? 0,
      isGuest: entry?.isGuest ?? false,
      invitedBy: entry?.invitedBy,
      x: event.clientX,
      y: event.clientY,
      offsetX,
      offsetY
    });
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
    const replacementMode = matchdayEdit.replacementMode || "player";
    if (!replacement) {
      setNotice({ type: "error", message: "יש לבחור שחקן חלופי" });
      return;
    }
    if (replacement === matchdayEdit.name) {
      setNotice({ type: "error", message: "יש לבחור שחקן שונה" });
      return;
    }
    try {
      let payload = {
        currentName: matchdayEdit.name,
        replacementName: replacement
      };
      if (replacementMode === "guest") {
        const position = matchdayEdit.replacementPosition || "ALL";
        const ratingValue =
          position === "GK"
            ? 0
            : clampNumber(Number(matchdayEdit.replacementRating || 1), 1, 10);
        payload = {
          ...payload,
          isGuest: true,
          position,
          rating: ratingValue
        };
      }
      const result = await apiFetch("/api/admin/matchday/roster/replace", {
        method: "POST",
        body: JSON.stringify(payload)
      }, token);
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

  const handleIssueRankerToken = async () => {
    const name = rankerTokenName.trim();
    if (!name) {
      setNotice({ type: "error", message: "יש להזין שם מדרג" });
      return;
    }
    setIssuingToken(true);
    try {
      const result = await apiFetch(
        "/api/admin/rankers/tokens",
        { method: "POST", body: JSON.stringify({ name }) },
        token
      );
      setIssuedToken(result);
      setRankerTokenName("");
      await refreshAll();
      setNotice({ type: "success", message: "טוקן הונפק בהצלחה" });
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setIssuingToken(false);
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
      <datalist id="cash-players-datalist">
        {players.map((player) => (
          <option key={player.name} value={player.name} />
        ))}
      </datalist>
      <button
        className={`cash-headline ${cashBalance < 0 ? "negative" : "positive"}`}
        type="button"
        onClick={() => {
          setCashModalOpen(true);
          setCashMode("choice");
        }}
      >
        <span>קופה</span>
        <strong>{formatCash(cashBalance)}</strong>
      </button>
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
              className={`matchday-card ${matchday.finalized ? "closed" : "open"}`}
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
              <div className={`matchday-view ${matchday.finalized ? "matchday-finalized" : ""}`}>
                <div className="stat-grid">
                  <div className="stat-card compact">
                  <span className="stat-icon" aria-hidden="true">
                    <StatIcon name="date" />
                  </span>
                  <span className="sr-only">תאריך</span>
                  <strong>{matchday.date}</strong>
                </div>
                <div className="stat-card compact stat-time">
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
                <div className="stat-card compact stat-player-count">
                  <span className="stat-icon" aria-hidden="true">
                    <StatIcon name="players" />
                  </span>
                  <span className="sr-only">שחקנים</span>
                  <strong>{matchdayParticipantCount}</strong>
                </div>
                </div>
              <div className="roster-panel">
                <div
                  className="roster-lines"
                  data-drop="roster"
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
                                  data-drop="group"
                                  data-group-key={item.key}
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
                                        data-drop="member"
                                        data-member-name={member.name}
                                        draggable
                                        onDragStart={() => setDraggingPlayer(member.name)}
                                        onDragEnd={() => setDraggingPlayer(null)}
                                        onTouchStart={(event) => {
                                          event.preventDefault();
                                          startTouchDrag(member.name, event);
                                        }}
                                        onPointerDown={(event) => startPointerDrag(member.name, event)}
                                        onPointerMove={(event) => {
                                          if (
                                            dragPointerIdRef.current === event.pointerId &&
                                            event.pointerType === "touch"
                                          ) {
                                            event.preventDefault();
                                            setDragGhost((prev) =>
                                              prev
                                                ? {
                                                    ...prev,
                                                    x: event.clientX,
                                                    y: event.clientY
                                                  }
                                                : prev
                                            );
                                          }
                                        }}
                                        onPointerUp={(event) => {
                                          if (dragPointerIdRef.current === event.pointerId) {
                                            handleDropAt(event.clientX, event.clientY);
                                            setDraggingPlayer(null);
                                            setDragGhost(null);
                                            touchDraggingRef.current = false;
                                            dragPointerIdRef.current = null;
                                          }
                                        }}
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
                                          if (touchDraggingRef.current) {
                                            return;
                                          }
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
                                            replacementName: "",
                                            replacementMode: "player",
                                            replacementPosition: "ALL",
                                            replacementRating: 5
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
                                data-drop="member"
                                data-member-name={player.name}
                                draggable
                                onDragStart={() => setDraggingPlayer(player.name)}
                                onDragEnd={() => setDraggingPlayer(null)}
                                onTouchStart={(event) => {
                                  event.preventDefault();
                                  startTouchDrag(player.name, event);
                                }}
                                onPointerDown={(event) => startPointerDrag(player.name, event)}
                                onPointerMove={(event) => {
                                  if (
                                    dragPointerIdRef.current === event.pointerId &&
                                    event.pointerType === "touch"
                                  ) {
                                    event.preventDefault();
                                    setDragGhost((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            x: event.clientX,
                                            y: event.clientY
                                          }
                                        : prev
                                    );
                                  }
                                }}
                                onPointerUp={(event) => {
                                  if (dragPointerIdRef.current === event.pointerId) {
                                    handleDropAt(event.clientX, event.clientY);
                                    setDraggingPlayer(null);
                                    setDragGhost(null);
                                    touchDraggingRef.current = false;
                                    dragPointerIdRef.current = null;
                                  }
                                }}
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
                                  if (touchDraggingRef.current) {
                                    return;
                                  }
                                  const guestEntry = guestsList.find(
                                    (guest) => guest.name === player.name
                                  );
                                  setMatchdayEdit({
                                    name: player.name,
                                    isGuest: player.isGuest,
                                    position: guestEntry?.position || player.position || "ALL",
                                    rating: guestEntry?.rating ?? 0,
                                    invitedBy: guestEntry?.invitedBy,
                                    replacementName: "",
                                    replacementMode: "player",
                                    replacementPosition: "ALL",
                                    replacementRating: 5
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
                  <GroupsColumns
                    teams={matchday.teams}
                    colors={teamColors}
                    onPickColor={handleTeamColorChange}
                    activePicker={teamColorPicker}
                    onTogglePicker={(index) =>
                      setTeamColorPicker((prev) => (prev === index ? null : index))
                    }
                    readOnly={matchday.finalized}
                  />
                  <CollapsibleCard
                    title="הגדרות מתקדמות ליצירת קבוצות"
                    collapsible
                    defaultOpen={false}
                  >
                    <div className="grid grid-2">
                      <div>
                        <div className="section-subtitle">פרמטרים ליצירת קבוצות</div>
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
                      </div>
                      <div>
                        <div className="section-subtitle">כוונון עדין</div>
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
                      </div>
                    </div>
                  </CollapsibleCard>
                </>
              ) : null}
              </div>
              <div className="button-row centered" style={{ marginTop: "16px" }}>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={handleGenerateTeams}
                  disabled={matchday.finalized}
                >
                  צור כוחות
                </button>
                {matchday.teams?.length ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={handleFinishMatchday}
                    disabled={matchday.finalized}
                  >
                    סיים משחק
                  </button>
                ) : null}
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
                        position: "ALL",
                        entryCountOriginal: 0
                      })
                    }
                  >
                  <ActionIcon name="plus" />
                  <span className="sr-only">הוספת שחקן</span>
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setPlayerImportOpen(true)}
                >
                  <ActionIcon name="entries" />
                  <span className="sr-only">ייבוא שחקנים</span>
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={handleCopyRatings}
                >
                  <ActionIcon name="copy" />
                  <span className="sr-only">העתקת דירוגים</span>
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={handleCopyEntries}
                >
                  <ActionIcon name="entries" />
                  <span className="sr-only">העתקת יתרות כניסה</span>
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
                          position: player.position || "ALL",
                          entryCountOriginal: player.entryCount ?? 0
                        })
                      }
                    >
                      <div className="player-chip-info player-card">
                        <div className="ranker-header">
                          <div className="ranker-name-block">
                            <div className="ranker-name-line">
                              <span className="role-icon">
                                <PositionIcon role={player.position} />
                              </span>
                              <span className="ranker-name-text">{player.name}</span>
                              {Number(player.averageRating ?? 0) > 7 ? (
                                <RatingBadge value={player.averageRating} className="ranker-badge" />
                              ) : (
                                <RatingBadge value={player.averageRating} />
                              )}
                            </div>
                            <div className="player-chip-meta">
                              <span className="chip rating-chip">
                                {formatRating(player.averageRating)}
                              </span>
                              <span
                                className={`chip entry-chip ${
                                  (player.entryCount ?? 0) < 0
                                    ? "entry-negative"
                                    : (player.entryCount ?? 0) === 0
                                      ? "entry-zero"
                                      : "entry-positive"
                                }`}
                              >
                                <span className="ltr-num">
                                  {player.entryCount ?? 0}
                                </span>
                                {"\u00A0"}
                                <span className="entry-label-text">כניסות</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
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

      {activeTab === "rankers" && (
        <div className="grid">
          <CollapsibleCard title="הנפקת טוקן">
            <label>שם מדרג</label>
            <div className="token-row">
              <input
                className="input"
                value={rankerTokenName}
                onChange={(event) => setRankerTokenName(event.target.value)}
                placeholder="לדוגמה: טדי"
              />
              <button
                className="button button-primary"
                type="button"
                onClick={handleIssueRankerToken}
                disabled={issuingToken}
              >
                הנפקה
              </button>
            </div>
            {issuedToken ? (
              <div className="token-result">
                <div className="pill">טוקן חדש עבור {issuedToken.name}</div>
                <div className="token-row compact">
                  <input
                    className="input input-compact"
                    value={issuedToken.token}
                    readOnly
                  />
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() =>
                      copyTextToClipboard(issuedToken.token)
                        .then(() => setNotice({ type: "success", message: "הטוקן הועתק" }))
                        .catch(() => setNotice({ type: "error", message: "העתקה נכשלה" }))
                    }
                  >
                    העתקה
                  </button>
                </div>
              </div>
            ) : null}
          </CollapsibleCard>

          {sortedRankers.length ? (
            <div className="ranker-stack">
              {sortedRankers.map((ranker) => {
                const rankings = ranker.rankings || {};
                const nonGoalkeepers = rankerPlayerList.filter(
                  (player) => player.position !== "GK"
                );
                const rankedCount = nonGoalkeepers.reduce(
                  (total, player) =>
                    total +
                    (Object.prototype.hasOwnProperty.call(rankings, player.name) ? 1 : 0),
                  0
                );
                return (
                  <CollapsibleCard
                    key={ranker.id || ranker.name}
                    title={ranker.name || "מדרג ללא שם"}
                    subtitle={`דורגו ${rankedCount} מתוך ${nonGoalkeepers.length}`}
                    collapsible
                    defaultOpen={false}
                  >
                    <div className="ranker-meta">
                      <span className="chip">
                        {ranker.token ? "טוקן פעיל" : "אין טוקן"}
                      </span>
                      {ranker.token ? (
                        <div className="token-row compact">
                          <input
                            className="input input-compact"
                            value={ranker.token}
                            readOnly
                          />
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() =>
                              copyTextToClipboard(ranker.token)
                                .then(() =>
                                  setNotice({ type: "success", message: "הטוקן הועתק" })
                                )
                                .catch(() =>
                                  setNotice({ type: "error", message: "העתקה נכשלה" })
                                )
                            }
                          >
                            העתקה
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="list" style={{ marginTop: "12px" }}>
                      {nonGoalkeepers.map((player) => {
                        const hasRanking = Object.prototype.hasOwnProperty.call(
                          rankings,
                          player.name
                        );
                        const value = rankings[player.name];
                        return (
                          <div
                            key={`${ranker.id || ranker.name}-${player.name}`}
                            className={`player-row ranker-row position-tone ${positionClass(
                              player.position
                            )}`}
                          >
                            <strong className="player-name player-name-large">
                              <span className="role-icon">
                                <PositionIcon role={player.position} />
                              </span>
                              <span>{player.name}</span>
                            </strong>
                            <span
                              className={`chip rating-chip ${hasRanking ? "" : "chip-muted"}`}
                            >
                              {hasRanking ? formatRating(value) : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleCard>
                );
              })}
            </div>
          ) : (
            <div className="notice">אין מדרגים עדיין</div>
          )}
        </div>
      )}

      {activeTab === "stats" && (
        <GeneralData
          setNotice={setNotice}
          statsEndpoint="/api/public/statistics"
          matchdayEndpoint="/api/admin/matchday/"
          showPlayerRatings
          showAverageRating
          openMatchdayDate={adminStatsMatchdayDate}
          authToken={token}
        />
      )}

      <Modal open={Boolean(playerModal)} onClose={() => setPlayerModal(null)}>
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
                <PositionPicker
                  value={playerModal.position || "ALL"}
                  onChange={(value) =>
                    setPlayerModal((prev) => ({
                      ...prev,
                      position: value
                    }))
                  }
                />
                <label>יתרת כניסות</label>
                <div className="entry-balance">
                  <div className="entry-row">
                    <span className="entry-label">יתרה נוכחית</span>
                    <span className="chip entry-chip entry-neutral">
                      {playerModal.entryCountOriginal ?? 0}
                    </span>
                  </div>
                  <div className="entry-note">הוספת כניסות מתבצעת דרך מסך הקופה בלבד.</div>
                </div>
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

      <Modal
        open={cashModalOpen}
        className="cash-modal"
        onClose={() => setCashModalOpen(false)}
      >
        <div className="modal-header-row">
          <div className="modal-header">קופה</div>
          <button
            className="icon-button"
            type="button"
            onClick={() => setCashModalOpen(false)}
          >
            X
          </button>
        </div>
        <div className="modal-body">
          <div className="stack">
            <div className="cash-summary-line">
              <span className="entry-label">יתרה נוכחית</span>
              <strong
                className={`cash-amount ${cashBalance < 0 ? "negative" : "positive"}`}
              >
                {formatCash(cashBalance)}
              </strong>
            </div>
            <div className="cash-mode-panel" key={cashMode}>
              {cashMode === "choice" ? (
                <div className="cash-choice">
                  <button
                    className="button button-secondary entry-button entry-remove cash-choice-button"
                    type="button"
                    onClick={() => setCashMode("expense")}
                  >
                    הוצאה
                  </button>
                  <button
                    className="button button-secondary entry-button entry-add cash-choice-button"
                    type="button"
                    onClick={() => setCashMode("income")}
                  >
                    הכנסה
                  </button>
                </div>
              ) : null}
              {cashMode === "expense" ? (
                <div className="cash-panel">
                  <label>סכום הוצאה (₪)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.5"
                    value={cashExpenseAmount}
                    onChange={(event) => setCashExpenseAmount(event.target.value)}
                    placeholder="לדוגמה: 120"
                  />
                  <label>סיבה להוצאה</label>
                  <input
                    className="input"
                    value={cashExpenseReason}
                    onChange={(event) => setCashExpenseReason(event.target.value)}
                    placeholder="למשל: כדורים"
                  />
                  <div className="button-row">
                    <button
                      className="button button-secondary entry-button entry-remove"
                      type="button"
                      onClick={handleCashExpense}
                    >
                      רשום הוצאה
                    </button>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => setCashMode("choice")}
                    >
                      חזרה
                    </button>
                  </div>
                </div>
              ) : null}
              {cashMode === "income" ? (
                <div className="cash-panel">
                  <label>שחקן</label>
                  <SuggestInput
                    value={cashIncomePlayer}
                    onChange={setCashIncomePlayer}
                    options={players.map((player) => player.name)}
                    placeholder="התחל להקליד שם"
                  />
                  <label>מספר כניסות שנרכשו</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    step="1"
                    value={cashIncomeEntries}
                    onChange={(event) => setCashIncomeEntries(event.target.value)}
                    placeholder="לדוגמה: 3"
                  />
                  <label>סכום הכנסה (₪)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.5"
                    value={cashIncomeAmount}
                    onChange={(event) => setCashIncomeAmount(event.target.value)}
                    placeholder="לדוגמה: 150"
                  />
                  <div className="button-row">
                    <button
                      className="button button-secondary entry-button entry-add"
                      type="button"
                      onClick={handleCashIncome}
                    >
                      רשום הכנסה
                    </button>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => setCashMode("choice")}
                    >
                      חזרה
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="divider" />
            {cashGuestTasks.length ? (
              <div className="cash-guest-tasks">
                <div className="section-subtitle">תשלומי אורחים</div>
                <div className="list">
                  {cashGuestTasks.map((task, index) => {
                    const label = task.invitedBy
                      ? `${task.name} - ${task.invitedBy}`
                      : task.name;
                    return (
                      <button
                        key={`${task.date}-${task.name}-${index}`}
                        className="cash-guest-task"
                        type="button"
                        onClick={() => {
                          setGuestPaymentModal(task);
                          setGuestPaymentMode("choice");
                          setGuestPaymentAmount("");
                          setGuestPaymentPayer("");
                        }}
                      >
                        <span className="cash-guest-check" aria-hidden="true" />
                        <span className="cash-guest-text">
                          {task.date} · {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="cash-log">
              <div className="section-subtitle">יומן שינויים</div>
              {pagedCashLogs.length ? (
                <div className="list">
                  {pagedCashLogs.map((entry, index) => {
                    const entryDate = entry.createdAt
                      ? new Date(entry.createdAt).toLocaleString("he-IL")
                      : "";
                    const deltaValue = Number(entry.delta || 0);
                    return (
                      <div className="cash-log-row" key={`${entry.createdAt}-${index}`}>
                        <span className="cash-log-date">{entryDate}</span>
                        <span className="cash-log-reason">{entry.reason || "עדכון"}</span>
                        <span
                          className={`cash-log-delta ${
                            deltaValue < 0 ? "negative" : "positive"
                          }`}
                        >
                          {deltaValue >= 0 ? "+" : ""}
                          {formatCash(deltaValue)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="notice">אין רישומים עדיין</div>
              )}
              <div className="cash-log-pagination">
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={cashPage <= 1}
                  onClick={() => setCashLogPage(cashPage - 1)}
                >
                  קודם
                </button>
                <span className="cash-log-page">
                  עמוד {cashPage} מתוך {cashTotalPages}
                </span>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={cashPage >= cashTotalPages}
                  onClick={() => setCashLogPage(cashPage + 1)}
                >
                  הבא
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(guestSetup?.open)}
        onClose={() => setGuestSetup(null)}
      >
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
                <PositionPicker
                  value={guestSetup.guests[guestSetup.index]?.position || "ALL"}
                  onChange={(value) => updateGuestSetupField("position", value)}
                />
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

      <Modal open={Boolean(matchdayEdit)} onClose={() => setMatchdayEdit(null)}>
        {matchdayEdit ? (
          <>
            <div className="modal-header">עריכת שחקן</div>
            <div className="modal-body">
              <div className="stack">
                <div className="pill">{matchdayEdit.name}</div>
                {matchdayEdit.isGuest ? (
                  <div className="swap-panel">
                    <div className="section-subtitle">הגדרות אורח קיים</div>
                    <label>תפקיד</label>
                    <PositionPicker
                      value={matchdayEdit.position || "ALL"}
                      onChange={(value) =>
                        setMatchdayEdit((prev) => ({
                          ...prev,
                          position: value,
                          rating: value === "GK" ? 0 : prev.rating
                        }))
                      }
                    />
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
                  </div>
                ) : null}

                <div className="swap-panel">
                  <div className="section-subtitle">החלפת שחקן</div>
                  <div className="swap-option-group">
                    <button
                      className={`swap-option ${
                        (matchdayEdit.replacementMode || "player") === "player"
                          ? "active"
                          : ""
                      }`}
                      type="button"
                      onClick={() =>
                        setMatchdayEdit((prev) => ({
                          ...prev,
                          replacementMode: "player"
                        }))
                      }
                    >
                      שחקן קיים
                    </button>
                    <button
                      className={`swap-option ${
                        matchdayEdit.replacementMode === "guest" ? "active" : ""
                      }`}
                      type="button"
                      onClick={() =>
                        setMatchdayEdit((prev) => ({
                          ...prev,
                          replacementMode: "guest"
                        }))
                      }
                    >
                      אורח חדש
                    </button>
                  </div>
                  {(matchdayEdit.replacementMode || "player") === "player" ? (
                    <SuggestInput
                      value={matchdayEdit.replacementName || ""}
                      onChange={(value) =>
                        setMatchdayEdit((prev) => ({
                          ...prev,
                          replacementName: value
                        }))
                      }
                      options={replacementOptions.map((player) => player.name)}
                      placeholder="בחר שחקן חלופי"
                    />
                  ) : (
                    <>
                      <input
                        className="input"
                        value={matchdayEdit.replacementName || ""}
                        onChange={(event) =>
                          setMatchdayEdit((prev) => ({
                            ...prev,
                            replacementName: event.target.value
                          }))
                        }
                        placeholder="שם אורח"
                      />
                      <label>תפקיד אורח</label>
                      <PositionPicker
                        value={matchdayEdit.replacementPosition || "ALL"}
                        onChange={(value) =>
                          setMatchdayEdit((prev) => ({
                            ...prev,
                            replacementPosition: value,
                            replacementRating: value === "GK" ? 0 : prev.replacementRating
                          }))
                        }
                      />
                      <label>דירוג אורח</label>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        value={matchdayEdit.replacementRating ?? 0}
                        disabled={matchdayEdit.replacementPosition === "GK"}
                        onChange={(event) =>
                          setMatchdayEdit((prev) => ({
                            ...prev,
                            replacementRating: event.target.value
                          }))
                        }
                      />
                    </>
                  )}
                </div>
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

      <Modal open={Boolean(confirmState)} onClose={() => setConfirmState(null)}>
        {confirmState ? (
          <>
            <div className="modal-header">{confirmState.title}</div>
            <div className="modal-body">
              <div className="notice">{confirmState.message}</div>
            </div>
            <div className="button-row">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setConfirmState(null)}
              >
                ביטול
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={confirmState.onConfirm}
              >
                {confirmState.confirmLabel || "אישור"}
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal open={finishModalOpen} onClose={() => setFinishModalOpen(false)}>
        <div className="modal-header">סיכום משחק</div>
        <div className="modal-body">
          <div className="stack">
            {matchday?.teams?.length ? (
              <div className="finish-team-grid">
                {matchday.teams.map((team, index) => {
                  const colorLabel =
                    TEAM_COLORS.find((color) => color.id === teamColors[index])?.label ||
                    "—";
                  const winsValue = Number(finishTeamWins[index] ?? 0);
                  const maxWins = Math.max(
                    0,
                    ...finishTeamWins.map((value) => Number(value || 0))
                  );
                  const isWinner = winsValue > 0 && winsValue === maxWins;
                  return (
                    <div
                      key={`finish-team-${index}`}
                      className={`finish-team-card team-color-${teamColors[index]} ${
                        isWinner ? "team-winner" : ""
                      }`}
                    >
                      <div className="finish-team-shirt">
                        <img src={TEAM_SHIRTS[teamColors[index]]} alt={colorLabel} />
                      </div>
                      <label className="finish-win-input">
                        <input
                          className="input input-compact"
                          type="number"
                          min="0"
                          step="1"
                        value={finishTeamWins[index] ?? ""}
                        onChange={(event) => {
                          const raw = event.target.value;
                          const value = raw === "" ? "" : Math.max(0, Number(raw));
                          setFinishTeamWins((prev) => {
                            const next = [...prev];
                            next[index] = value;
                            return next;
                          });
                        }}
                      />
                    </label>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="notice">אין קבוצות לבחירה</div>
            )}
            <div className="finish-water-panel">
              <div className="finish-water-title">
                <span className="water-icon">
                  <WaterBottleIcon />
                </span>
                <span>מי הביא מים?</span>
              </div>
              <SuggestInput
                value={finishWaterCarrier}
                onChange={setFinishWaterCarrier}
                options={waterCarrierOptions}
                placeholder="בחר שחקן"
              />
            </div>
          </div>
        </div>
        <div className="button-row">
          <button
            className="button button-primary"
            type="button"
            onClick={handleConfirmFinishMatchday}
            disabled={!finishWaterCarrier.trim()}
          >
            סגור משחק
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setFinishModalOpen(false)}
          >
            ביטול
          </button>
        </div>
      </Modal>

      {dragGhost
        ? createPortal(
            <div
              className={`roster-bubble drag-ghost position-tone ${positionClass(
                dragGhost.position
              )}`}
              style={{
                left: dragGhost.x,
                top: dragGhost.y,
                transform: `translate(-${dragGhost.offsetX || 0}px, -${
                  dragGhost.offsetY || 0
                }px)`
              }}
            >
              <span className="roster-name">
                <span className="role-icon">
                  <PositionIcon role={dragGhost.position} />
                </span>
                {dragGhost.name}
                <RatingBadge value={dragGhost.averageRating} />
              </span>
              {dragGhost.isGuest && (
                <span className="bubble-hint">
                  {dragGhost.invitedBy
                    ? `${dragGhost.invitedBy} - אורח`
                    : "אורח"}
                </span>
              )}
            </div>,
            document.body
          )
        : null}

      <Modal open={playerImportOpen} onClose={() => setPlayerImportOpen(false)}>
        <div className="modal-header">ייבוא שחקנים</div>
        <div className="modal-body">
          <div className="stack">
            <div className="notice">
              כל שורה בפורמט: שם שחקן: X כניסות
            </div>
            <textarea
              className="textarea"
              value={playerImportMessage}
              onChange={(event) => setPlayerImportMessage(event.target.value)}
              placeholder="לדוגמה: ישראל ישראלי: 4 כניסות"
            />
          </div>
        </div>
        <div className="button-row">
          <button className="button button-primary" type="button" onClick={handleImportPlayers}>
            ייבוא
          </button>
          <button className="button button-secondary" type="button" onClick={() => setPlayerImportOpen(false)}>
            ביטול
          </button>
        </div>
      </Modal>

      <Modal
        open={Boolean(guestPaymentModal)}
        onClose={() => setGuestPaymentModal(null)}
        className="cash-modal"
      >
        {guestPaymentModal ? (
          <>
            <div className="modal-header">תשלום אורח</div>
            <div className="modal-body">
              <div className="stack">
                <div className="cash-summary-line">
                  <span className="entry-label">אורח</span>
                  <strong className="cash-amount">
                    {guestPaymentModal.name}
                  </strong>
                </div>
                {guestPaymentMode === "choice" ? (
                  <div className="cash-choice">
                    <button
                      className="button button-secondary entry-button entry-add cash-choice-button"
                      type="button"
                      onClick={() => setGuestPaymentMode("income")}
                    >
                      תשלום ישיר
                    </button>
                    <button
                      className="button button-secondary entry-button entry-remove cash-choice-button"
                      type="button"
                      onClick={() => setGuestPaymentMode("entry")}
                    >
                      תשלום על חשבון שחקן
                    </button>
                  </div>
                ) : null}
                {guestPaymentMode === "income" ? (
                  <div className="cash-panel">
                    <label>סכום תשלום (₪)</label>
                    <input
                      className="input"
                      type="number"
                      step="0.5"
                      value={guestPaymentAmount}
                      onChange={(event) => setGuestPaymentAmount(event.target.value)}
                      placeholder="לדוגמה: 50"
                    />
                    <div className="button-row">
                      <button
                        className="button button-secondary entry-button entry-add"
                        type="button"
                        onClick={async () => {
                          const amount = Number(guestPaymentAmount);
                          if (!Number.isFinite(amount) || amount <= 0) {
                            setNotice({ type: "error", message: "סכום לא תקין" });
                            return;
                          }
                          try {
                            await apiFetch(
                              "/api/admin/cash/guest-resolve",
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  name: guestPaymentModal.name,
                                  date: guestPaymentModal.date,
                                  method: "income",
                                  amount
                                })
                              },
                              token
                            );
                            await refreshCash();
                            setGuestPaymentModal(null);
                            setNotice({ type: "success", message: "התשלום נרשם" });
                          } catch (error) {
                            setNotice({ type: "error", message: error.message });
                          }
                        }}
                      >
                        אישור תשלום
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => setGuestPaymentMode("choice")}
                      >
                        חזרה
                      </button>
                    </div>
                  </div>
                ) : null}
                {guestPaymentMode === "entry" ? (
                  <div className="cash-panel">
                    <label>שחקן משלם</label>
                    <SuggestInput
                      value={guestPaymentPayer}
                      onChange={setGuestPaymentPayer}
                      options={players.map((player) => player.name)}
                      placeholder="בחר שחקן"
                    />
                    <div className="button-row">
                      <button
                        className="button button-secondary entry-button entry-remove"
                        type="button"
                        onClick={async () => {
                          if (!guestPaymentPayer.trim()) {
                            setNotice({ type: "error", message: "יש לבחור שחקן משלם" });
                            return;
                          }
                          try {
                            await apiFetch(
                              "/api/admin/cash/guest-resolve",
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  name: guestPaymentModal.name,
                                  date: guestPaymentModal.date,
                                  method: "entry",
                                  payerName: guestPaymentPayer.trim()
                                })
                              },
                              token
                            );
                            await refreshAll();
                            setGuestPaymentModal(null);
                            setNotice({ type: "success", message: "הכניסה עודכנה" });
                          } catch (error) {
                            setNotice({ type: "error", message: error.message });
                          }
                        }}
                      >
                        חיוב כניסה
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => setGuestPaymentMode("choice")}
                      >
                        חזרה
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
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
        const normalizedValue = roundToTenth(clampNumber(numericValue, 1, 10));
        const savedValue = Number(savedRatings[player.name] ?? 0);
        if (normalizedValue === savedValue) {
          return;
        }
        if (savedValue === 0 && normalizedValue === 5) {
          return;
        }
        payload[player.name] = normalizedValue;
      });

      if (!Object.keys(payload).length) {
        setNotice({ type: "success", message: "אין שינויים לשמירה" });
        return;
      }

      await apiFetch(
        "/api/ranker/ratings",
        {
          method: "POST",
          body: JSON.stringify({ rankings: payload })
        },
        token
      );
      setNotice({ type: "success", message: "הדירוגים נשמרו" });
      setSavedRatings((prev) => ({ ...prev, ...payload }));
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
            const isStar = Number(player.averageRating ?? 0) > 7;
            return (
              <React.Fragment key={player.name}>
                {dimRanked && index === firstRankedIndex ? (
                  <div className="ranker-divider" aria-hidden="true" />
                ) : null}
                <div
                  className={`player-row ranker-row position-tone ${positionClass(player.position)} ${
                    hasRating ? "rated" : "unrated"
                  } ${isGoalkeeper ? "goalkeeper" : ""} ${
                    hasRating ? "ranker-dim" : ""
                  }`}
                  ref={(node) => {
                    if (node) {
                      rowRefs.current.set(player.name, node);
                    } else {
                      rowRefs.current.delete(player.name);
                    }
                  }}
                >
                  <div className="player-meta ranker-meta">
                    <div className="ranker-header">
                      <div className="ranker-name-block">
                        <div className="ranker-name-line">
                          <span className="role-icon">
                            <PositionIcon role={player.position} />
                          </span>
                          <span className="ranker-name-text">{player.name}</span>
                          {!isStar ? (
                            <RatingBadge value={player.averageRating} />
                          ) : (
                            <RatingBadge
                              value={player.averageRating}
                              className="ranker-badge"
                            />
                          )}
                        </div>
                        <div className="ranker-separator" aria-hidden="true" />
                      </div>
                    </div>
                  </div>
                  <RatingSlider
                    value={draftRatings[player.name] ?? resolveDefaultRating(player)}
                    average={player.averageRating}
                    onChange={(value) => updateDraftRating(player.name, value)}
                    disabled={isGoalkeeper}
                    showValue={false}
                    showBubble
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
