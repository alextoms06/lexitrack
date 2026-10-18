import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BarChart3, BookOpen, BriefcaseBusiness, CalendarDays,
  Check, Code2, Download, Eye, FileDown, Flame, GraduationCap,
  Heart, House, LibraryBig, Menu, NotebookPen, Plus, Search, Settings,
  Sparkles, Trash2, Upload, Volume2, X
} from "lucide-react";
import ModelTest from "./ModelTest.jsx";
import { normalizeWord, readWordsResult, saveWords, upsertWord } from "./lib/wordStore.js";
import { downloadFile, fromCSV, toCSV } from "./lib/csv.js";
import { MAX_BACKUP_BYTES, mergeVocabularyBackup, parseVocabularyBackup, serializeVocabularyBackup } from "./lib/backup.js";
import "./vocabulary.css";

const CATEGORY_META = {
  academic: { label: "Academic", icon: GraduationCap },
  technical: { label: "Technical", icon: Code2 },
  general: { label: "General", icon: BriefcaseBusiness },
  interesting: { label: "Interesting", icon: Sparkles }
};
const CATEGORY_KEYS = Object.keys(CATEGORY_META);

function addedLabel(date) {
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return "Date unknown";
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  if (!days) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "GOOD MORNING" : hour < 18 ? "GOOD AFTERNOON" : "GOOD EVENING";
}

function App() {
  const [initial] = useState(readWordsResult);
  const [words, setWords] = useState(initial.words);
  const [storageError, setStorageError] = useState(initial.error);
  const [view, setView] = useState("home");
  const [filter, setFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initial.words[0]?.id || null);
  const [editingWord, setEditingWord] = useState(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreError, setRestoreError] = useState("");
  const [isReadingImport, setIsReadingImport] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const searchRef = useRef(null);
  const importRef = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function notify(message) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3200);
  }

  function commit(nextWords, successMessage) {
    try {
      saveWords(nextWords);
      setWords(nextWords);
      setStorageError("");
      if (successMessage) notify(successMessage);
      return true;
    } catch {
      setStorageError("This browser could not save your change. Check available storage and try again.");
      return false;
    }
  }

  const sortedWords = useMemo(() => [...words].sort((first, second) => {
    if (sortOrder === "alphabetical") return first.word.localeCompare(second.word);
    const direction = sortOrder === "oldest" ? 1 : -1;
    return direction * (new Date(first.dateAdded) - new Date(second.dateAdded));
  }), [sortOrder, words]);
  const selectedWord = selectedId ? words.find((word) => word.id === selectedId) || null : null;
  const likedCount = words.filter((word) => word.liked).length;
  const masteredCount = words.filter((word) => word.mastered).length;
  const categories = CATEGORY_KEYS.map((key) => ({
    key,
    ...CATEGORY_META[key],
    count: words.filter((word) => word.category === key).length
  }));
  const filteredWords = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return sortedWords.filter((word) => {
      const categoryMatches = filter === "all" || (filter === "liked" ? word.liked : word.category === filter);
      const queryMatches = !needle || [word.word, word.definition, word.example, word.note, word.partOfSpeech, word.category]
        .some((value) => String(value || "").toLocaleLowerCase().includes(needle));
      return categoryMatches && queryMatches;
    });
  }, [filter, query, sortedWords]);
  const reviewDeck = useMemo(
    () => [...words].sort((a, b) => Number(a.mastered) - Number(b.mastered) || a.reviewCount - b.reviewCount),
    [words]
  );
  const activeCard = reviewDeck.length ? reviewDeck[reviewIndex % reviewDeck.length] : null;

  function navigate(nextView) {
    setView(nextView);
    setMobileNavOpen(false);
    if (nextView === "review") setRevealed(false);
    if (nextView === "search") {
      setView("library");
      window.requestAnimationFrame(() => searchRef.current?.focus());
    }
  }

  function saveEntry(fields) {
    const result = upsertWord(words, fields, editingWord);
    if (result.error) return result;
    if (!commit(result.words, result.isEditing ? "Word updated" : "Word added to your library")) {
      return { error: "Could not save to this browser. Please try again." };
    }
    setSelectedId(result.saved.id);
    setFilter("all");
    setQuery("");
    setView("library");
    setMobileNavOpen(false);
    setEditingWord(null);
    return { success: true };
  }

  function deleteEntry(word) {
    if (!window.confirm(`Delete “${word.word}” from your vocabulary?`)) return;
    const next = words.filter((item) => item.id !== word.id);
    if (commit(next, "Word deleted")) {
      setSelectedId(next[0]?.id || null);
      setReviewIndex(0);
    }
  }

  function toggleLiked(word) {
    commit(words.map((item) => item.id === word.id ? { ...item, liked: !item.liked } : item), word.liked ? "Removed from liked words" : "Added to liked words");
  }

  function rateCard(mastered) {
    if (!activeCard) return;
    const next = words.map((word) => word.id === activeCard.id
      ? { ...word, mastered, reviewCount: (word.reviewCount || 0) + 1 }
      : word);
    if (commit(next, mastered ? "Marked as mastered" : "Added back to your review list")) {
      setRevealed(false);
      setReviewIndex((index) => index + 1);
    }
  }

  useEffect(() => {
    function handleReviewKeys(event) {
      if (view !== "review" || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") { event.preventDefault(); setRevealed((value) => !value); }
      if (revealed && event.key === "ArrowRight") rateCard(true);
      if (revealed && event.key === "ArrowLeft") rateCard(false);
    }
    window.addEventListener("keydown", handleReviewKeys);
    return () => window.removeEventListener("keydown", handleReviewKeys);
  }, [view, revealed, activeCard, words]);

  async function importFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setIsReadingImport(true);
    setRestoreError("");
    setRestorePreview(null);
    try {
      if (file.size > MAX_BACKUP_BYTES) {
        throw new Error(`This file exceeds the ${Math.floor(MAX_BACKUP_BYTES / (1024 * 1024))} MB import limit.`);
      }
      const text = await file.text();
      let incomingWords;
      let skipped = 0;
      if (file.name.toLowerCase().endsWith(".csv")) {
        incomingWords = [];
        for (const row of fromCSV(text)) {
          const normalized = normalizeWord(row);
          if (normalized) incomingWords.push(normalized);
          else skipped += 1;
        }
      } else {
        const backup = parseVocabularyBackup(text);
        incomingWords = backup.words;
        skipped = backup.skipped;
      }

      const preview = mergeVocabularyBackup(words, incomingWords, skipped);
      setRestorePreview({
        fileName: file.name,
        incomingWords,
        skipped: preview.skipped,
        duplicates: preview.duplicates,
        imported: preview.imported
      });
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : "Could not read this backup.");
    } finally {
      setIsReadingImport(false);
      input.value = "";
    }
  }

  function confirmRestore() {
    if (!restorePreview) return;
    const latest = readWordsResult();
    if (latest.error) {
      setStorageError(latest.error);
      setRestoreError("Could not safely merge this backup because local vocabulary could not be read.");
      return;
    }
    const merged = mergeVocabularyBackup(latest.words, restorePreview.incomingWords, restorePreview.skipped);
    if (merged.imported && !commit(merged.words)) return;
    if (!merged.imported) setWords(latest.words);
    if (merged.additions[0]) setSelectedId(merged.additions[0].id);
    notify(`Imported ${merged.imported}; skipped ${merged.skipped}; duplicates ${merged.duplicates}`);
    setRestoreOpen(false);
    setRestorePreview(null);
    setRestoreError("");
  }

  function exportFile(format) {
    try {
      if (format === "csv") downloadFile("lexitrack-words.csv", toCSV(words), "text/csv;charset=utf-8");
      else {
        const date = new Date().toISOString().slice(0, 10);
        downloadFile(`lexitrack-backup-${date}.json`, serializeVocabularyBackup(words), "application/json");
      }
      notify(`Exported ${words.length} ${words.length === 1 ? "word" : "words"}`);
    } catch {
      setStorageError("Could not export your vocabulary. Please try again.");
    }
  }

  function clearLibrary() {
    if (!words.length || !window.confirm("Delete every saved word from this browser? This cannot be undone.")) return;
    if (commit([], "Your local library was cleared")) { setSelectedId(null); setFilter("all"); }
  }

  function openRestore() {
    setRestorePreview(null);
    setRestoreError("");
    setRestoreOpen(true);
  }

  return <div className="lexi-app">
    {mobileNavOpen && <button type="button" className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
    <aside className={`lexi-sidebar ${mobileNavOpen ? "is-open" : ""}`}>
      <a href="#home" className="lexi-brand" onClick={(event) => { event.preventDefault(); navigate("home"); }}><span className="lexi-brand-mark">L</span><span>Lexi<span>Track</span></span></a>
      <p className="side-label">WORKSPACE</p>
      <nav className="lexi-nav" aria-label="Main navigation">
        <NavButton icon={House} label="Home" active={view === "home"} onClick={() => navigate("home")} />
        <NavButton icon={Search} label="Search" active={false} onClick={() => navigate("search")} />
        <NavButton icon={LibraryBig} label="Your Library" count={words.length} active={view === "library"} onClick={() => navigate("library")} />
        <NavButton icon={BookOpen} label="Flashcards" active={view === "review"} onClick={() => navigate("review")} />
        <NavButton icon={BarChart3} label="Stats" active={view === "stats"} onClick={() => navigate("stats")} />
        <NavButton icon={Settings} label="Settings" active={view === "settings"} onClick={() => navigate("settings")} />
        <NavButton icon={NotebookPen} label="Model Lab" active={view === "model"} onClick={() => navigate("model")} />
      </nav>
      <div className="side-list-heading"><span>YOUR LISTS</span><button type="button" aria-label="Add a word" onClick={() => setEditingWord({})}><Plus size={16} /></button></div>
      <div className="category-nav">
        <button className={`category-link ${filter === "liked" ? "active" : ""}`} type="button" onClick={() => { setFilter("liked"); navigate("library"); }}><Heart size={15} className="liked-icon" /><span>Liked Words</span><small>{likedCount}</small></button>
        {categories.map(({ key, label, icon: Icon, count }) => <button key={key} className={`category-link ${filter === key ? "active" : ""}`} type="button" onClick={() => { setFilter(key); navigate("library"); }}><Icon size={15} /><span>{label}</span><small>{count}</small></button>)}
      </div>
      <div className="sidebar-bottom"><div className="side-stat"><div className="streak-line"><Flame size={14} /> YOUR COLLECTION</div><strong>{words.length}<small> words</small></strong><p>{masteredCount} mastered · {words.length - masteredCount} to revisit</p></div><div className="sidebar-foot"><span className="status-dot" /> Saved locally on this device</div></div>
    </aside>

    <main className="lexi-main">
      <header className="lexi-topbar"><button type="button" className="mobile-menu-button" aria-label="Toggle navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}><Menu size={19} /></button><label className="global-search"><Search size={16} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => { if (view === "home") setView("library"); }} placeholder="Search your words, meanings, or lists..." aria-label="Search your vocabulary" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button>}</label><div className="topbar-actions"><span className={`sync-state ${storageError ? "has-error" : ""}`}><span /> {storageError ? "Save issue" : "All changes saved"}</span><button type="button" className="profile-button" title="Open settings" aria-label="Open settings" onClick={() => navigate("settings")}>A</button></div></header>
      {storageError && <div className="storage-alert" role="alert"><span>{storageError}</span><button type="button" aria-label="Dismiss warning" onClick={() => setStorageError("")}><X size={16} /></button></div>}

      {view === "model" ? <div className="model-lab-view"><ModelTest embedded /></div>
        : view === "review" ? <ReviewView word={activeCard} index={reviewIndex} count={reviewDeck.length} revealed={revealed} onReveal={() => setRevealed((value) => !value)} onRate={rateCard} onBack={() => navigate("home")} />
          : view === "stats" ? <StatsView words={words} masteredCount={masteredCount} categories={categories} />
            : view === "settings" ? <SettingsView onImport={openRestore} onExport={exportFile} onClear={clearLibrary} wordCount={words.length} storageError={storageError} />
              : <>
                <div className="page-heading-row"><div><p className="page-eyebrow">{view === "home" ? greeting() : "YOUR WORD JOURNAL"}</p><h1>{view === "home" ? <>Build a brighter you,<br /><em>one word at a time.</em></> : "Your vocabulary"}<span className="title-period">.</span></h1></div><button className="primary-action" type="button" onClick={() => setEditingWord({})}><Plus size={17} /> Add a word</button></div>
                {view === "home" && <HomeOverview words={sortedWords} selectedWord={selectedWord} onSelect={setSelectedId} onAdd={() => setEditingWord({})} onLike={toggleLiked} onReview={() => navigate("review")} />}
                <section className="library-section" aria-labelledby="library-heading"><div className="library-heading-row"><div><p className="page-eyebrow">THE COLLECTION</p><h2 id="library-heading">{view === "home" ? "Your vocabulary" : "Your library"}<span>{filteredWords.length} {filteredWords.length === 1 ? "word" : "words"}</span></h2></div><div className="library-actions"><button className="subtle-action" type="button" onClick={openRestore}><Upload size={14} /> Import backup</button><button className="subtle-action" type="button" onClick={() => exportFile("json")}><Download size={14} /> Export backup</button><ExportMenu onExport={exportFile} /></div></div>
                  <div className="library-toolbar"><div className="filter-tabs" role="group" aria-label="Filter vocabulary by category">{[{ key: "all", label: "All" }, { key: "liked", label: "Liked" }, ...categories].map((item) => <button key={item.key} type="button" className={filter === item.key ? "selected" : ""} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}<i>{item.key === "all" ? words.length : item.key === "liked" ? likedCount : item.count}</i></button>)}</div><label className="list-sort-label"><CalendarDays size={13} /><span className="visually-hidden">Sort words</span><select aria-label="Sort words" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option value="newest">Date added</option><option value="oldest">Oldest first</option><option value="alphabetical">A to Z</option></select></label></div>
                  {filteredWords.length ? <div className="word-list" role="list">{filteredWords.map((word, index) => <WordRow key={word.id} word={word} index={index} selected={word.id === selectedWord?.id} onSelect={() => setSelectedId(word.id)} onEdit={() => setEditingWord(word)} onDelete={() => deleteEntry(word)} onLike={() => toggleLiked(word)} />)}</div> : <EmptyLibrary hasWords={words.length > 0} onAdd={() => setEditingWord({})} onClear={() => { setQuery(""); setFilter("all"); }} />}
                  <div className="library-footer"><span>LEXITRACK <i>·</i> YOUR PERSONAL WORD JOURNAL</span><span><span className="status-dot" /> Stored locally</span></div>
                </section>
              </>}
      <footer className="app-footer"><span>LEXITRACK <i>·</i> A LITTLE MORE LANGUAGE, EVERY DAY.</span><span>LOCAL-FIRST VOCABULARY JOURNAL</span></footer>
    </main>

    {view !== "model" && view !== "review" && <WordDetails word={selectedWord} onEdit={() => selectedWord && setEditingWord(selectedWord)} onLike={() => selectedWord && toggleLiked(selectedWord)} onClose={() => setSelectedId(null)} />}
    <input ref={importRef} className="visually-hidden" type="file" accept=".json,.csv,application/json,text/csv" onChange={importFile} />
    {restoreOpen && <BackupRestoreDialog preview={restorePreview} error={restoreError} loading={isReadingImport} onChoose={() => importRef.current?.click()} onClose={() => { setRestoreOpen(false); setRestorePreview(null); setRestoreError(""); }} onConfirm={confirmRestore} />}
    {editingWord && <WordDialog word={editingWord.id ? editingWord : null} onClose={() => setEditingWord(null)} onSave={saveEntry} />}
    {toast && <div className="app-toast" role="status"><Check size={15} /> {toast}<button type="button" aria-label="Dismiss notification" onClick={() => setToast("")}><X size={14} /></button></div>}
  </div>;
}

function NavButton({ icon: Icon, label, active, count, onClick }) {
  return <button className={`lexi-nav-item ${active ? "active" : ""}`} type="button" onClick={onClick} aria-current={active ? "page" : undefined}><Icon size={17} /><span>{label}</span>{count !== undefined && <small>{count}</small>}</button>;
}

function HomeOverview({ words, selectedWord, onSelect, onAdd, onLike, onReview }) {
  const recent = words.slice(0, 5);
  return <>
    <section className="hero-grid" aria-label="Vocabulary overview"><article className="featured-word"><div className="feature-copy"><p className="page-eyebrow"><span className="eyebrow-line" /> FEATURED WORD</p>{selectedWord ? <><h2>{selectedWord.word}</h2><span className="feature-part">{selectedWord.partOfSpeech || CATEGORY_META[selectedWord.category]?.label || "Vocabulary"}</span><p className="feature-definition">{selectedWord.definition}</p></> : <><h2>Your next<br />favorite word.</h2><p className="feature-definition">Add a word to start building a collection that sounds like you.</p></>}<div className="feature-controls">{selectedWord ? <><button className="round-play" type="button" aria-label={`Play pronunciation of ${selectedWord.word}`} onClick={() => speakWord(selectedWord.word)}><Volume2 size={17} /></button><button className={`feature-like ${selectedWord.liked ? "is-liked" : ""}`} type="button" onClick={() => onLike(selectedWord)}><Heart size={15} fill={selectedWord.liked ? "currentColor" : "none"} /> {selectedWord.liked ? "Liked" : "Save"}</button></> : <button className="round-play add-first" type="button" onClick={onAdd}><Plus size={17} /> Add your first word</button>}{words.length > 0 && <button className="feature-review" type="button" onClick={onReview}>Review words <ArrowRight size={14} /></button>}</div></div><div className="feature-art" aria-hidden="true"><span className="art-ridge ridge-one" /><span className="art-ridge ridge-two" /><span className="art-caption">A WORD, WELL KEPT</span></div></article><div className="stats-grid"><StatCard label="TOTAL WORDS" value={words.length} note="in your library" icon={LibraryBig} /><StatCard label="MASTERED" value={words.filter((word) => word.mastered).length} note="words remembered" icon={Check} accent /><StatCard label="TO REVIEW" value={words.filter((word) => !word.mastered).length} note="ready when you are" icon={BookOpen} /></div></section>
    <section className="recent-section" aria-labelledby="recent-heading"><div className="recent-header"><h2 id="recent-heading">Recently added</h2><span>YOUR LATEST FINDS</span></div>{recent.length ? <div className="recent-cards">{recent.map((word, index) => <button key={word.id} type="button" className={`recent-card recent-art-${index % 5} ${selectedWord?.id === word.id ? "active" : ""}`} onClick={() => onSelect(word.id)}><span className="recent-art"><CategoryIcon category={word.category} /></span><strong>{word.word}</strong><small>{word.definition}</small></button>)}</div> : <div className="recent-empty"><span className="recent-empty-art"><BookOpen size={20} /></span><div><strong>Your recent words will live here.</strong><small>Save the first word that catches your attention.</small></div><button type="button" onClick={onAdd}><Plus size={15} /> Add word</button></div>}</section>
  </>;
}

function StatCard({ label, value, note, icon: Icon, accent }) {
  return <article className={`stat-tile ${accent ? "accent" : ""}`}><span className="stat-icon"><Icon size={15} /></span><small>{label}</small><strong>{value}</strong><span className="stat-note">{note}</span></article>;
}

function CategoryIcon({ category, size = 16 }) {
  const Icon = CATEGORY_META[category]?.icon || BriefcaseBusiness;
  return <Icon size={size} />;
}

function WordRow({ word, index, selected, onSelect, onEdit, onDelete, onLike }) {
  return <article className={`word-row ${selected ? "selected" : ""}`} role="listitem" style={{ "--row-index": index }}><button className={`word-heart ${word.liked ? "liked" : ""}`} type="button" aria-label={word.liked ? `Unlike ${word.word}` : `Like ${word.word}`} onClick={onLike}><Heart size={15} fill={word.liked ? "currentColor" : "none"} /></button><button className="word-row-main" type="button" onClick={onSelect}><span className="word-name-line"><strong>{word.word}</strong>{word.partOfSpeech && <em>{word.partOfSpeech}</em>}{word.mastered && <span className="mastered-pill"><Check size={10} /> Mastered</span>}</span><span className="word-definition">{word.definition}</span>{word.example && <span className="word-example">“{word.example}”</span>}{word.note && <span className="word-note"><NotebookPen size={11} /> {word.note}</span>}</button><span className="word-category"><CategoryIcon category={word.category} size={13} /> {CATEGORY_META[word.category]?.label || "General"}</span><time className="word-date" dateTime={word.dateAdded}>{addedLabel(word.dateAdded)}</time><div className="word-actions"><button type="button" className="row-action" aria-label={`Edit ${word.word}`} title="Edit word" onClick={onEdit}><NotebookPen size={15} /></button><button type="button" className="row-action danger" aria-label={`Delete ${word.word}`} title="Delete word" onClick={onDelete}><Trash2 size={15} /></button></div></article>;
}

function WordDetails({ word, onEdit, onLike, onClose }) {
  if (!word) return <aside className="word-detail-panel empty-detail"><button type="button" className="detail-close" aria-label="Close word details" onClick={onClose}><X size={17} /></button><div className="detail-empty-icon"><BookOpen size={23} /></div><p className="page-eyebrow">WORD DETAILS</p><h2>Pick a word<br />to explore.</h2><p>Select any word in your library to see its definition, examples, and notes.</p></aside>;
  return <aside className="word-detail-panel" aria-label={`Details for ${word.word}`}><div className="detail-top"><span className="page-eyebrow">WORD DETAILS</span><button type="button" className="detail-close" aria-label="Close word details" onClick={onClose}><X size={17} /></button></div><div className="detail-art"><CategoryIcon category={word.category} size={34} /><span>{CATEGORY_META[word.category]?.label || "General"} collection</span></div><h2>{word.word}</h2><div className="detail-pronunciation">{word.partOfSpeech || "Vocabulary"}<button type="button" aria-label={`Play pronunciation of ${word.word}`} onClick={() => speakWord(word.word)}><Volume2 size={16} /></button></div><div className="detail-actions"><button type="button" className="detail-primary" onClick={onEdit}><NotebookPen size={15} /> Edit word</button><button type="button" className={`detail-heart ${word.liked ? "is-liked" : ""}`} onClick={onLike} aria-label={word.liked ? "Unlike this word" : "Like this word"}><Heart size={16} fill={word.liked ? "currentColor" : "none"} /></button></div><div className="detail-tabs"><span className="current">About</span><span>Added {addedLabel(word.dateAdded)}</span></div><DetailBlock title="Meaning"><p>{word.definition}</p></DetailBlock>{word.example && <DetailBlock title="Example sentence"><blockquote>{word.example}</blockquote></DetailBlock>}{word.note && <DetailBlock title="Personal note"><p>{word.note}</p></DetailBlock>}<DetailBlock title="Collection"><p>{CATEGORY_META[word.category]?.label || "General"}{word.mastered ? " · Mastered" : " · In review"}</p></DetailBlock></aside>;
}

function DetailBlock({ title, children }) { return <section className="detail-block"><h3>{title}</h3>{children}</section>; }

function EmptyLibrary({ hasWords, onAdd, onClear }) {
  return <div className="library-empty"><span className="empty-mark"><BookOpen size={22} /></span><h3>{hasWords ? "No words match this view" : "Your library is ready for its first word"}</h3><p>{hasWords ? "Try another search or collection, or reset your filters." : "Add words manually, then return here to search, sort, and review them."}</p>{hasWords ? <button className="text-button" type="button" onClick={onClear}>Clear filters</button> : <button className="primary-action" type="button" onClick={onAdd}><Plus size={16} /> Add your first word</button>}</div>;
}

function ExportMenu({ onExport }) {
  const [open, setOpen] = useState(false);
  return <div className="export-wrap"><button className="subtle-action" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Download size={14} /> Export</button>{open && <div className="export-popover"><button type="button" onClick={() => { onExport("json"); setOpen(false); }}><FileDown size={14} /> Export backup</button><button type="button" onClick={() => { onExport("csv"); setOpen(false); }}><FileDown size={14} /> Export CSV</button></div>}</div>;
}

function BackupRestoreDialog({ preview, error, loading, onChoose, onClose, onConfirm }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="word-dialog backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-dialog-title">
      <div className="dialog-heading"><div><p className="page-eyebrow">LOCAL BACKUP</p><h2 id="backup-dialog-title">Restore vocabulary</h2></div><button className="dialog-close" type="button" aria-label="Close restore dialog" onClick={onClose}><X size={19} /></button></div>
      <p className="backup-explainer">Choose a LexiTrack JSON backup or CSV. Existing entries are never overwritten or removed; matching words are skipped.</p>
      <button className="subtle-action backup-choose" type="button" onClick={onChoose} disabled={loading}><Upload size={15} /> {loading ? "Reading file…" : "Choose backup file"}</button>
      {loading && <p className="backup-state" role="status">Validating local file…</p>}
      {error && <p className="form-error backup-error" role="alert">{error}</p>}
      {preview && <div className="backup-preview" aria-live="polite"><p className="backup-file-name">{preview.fileName}</p><dl><div><dt>Will import</dt><dd>{preview.imported}</dd></div><div><dt>Duplicates</dt><dd>{preview.duplicates}</dd></div><div><dt>Skipped invalid</dt><dd>{preview.skipped}</dd></div></dl><p>Review the counts, then confirm the merge. Your existing vocabulary stays unchanged.</p></div>}
      <div className="dialog-footer backup-footer"><span><span className="status-dot" /> Processed on this device only</span><div><button className="text-button" type="button" onClick={onClose}>Cancel</button><button className="primary-action" type="button" onClick={onConfirm} disabled={!preview || loading}>Merge {preview?.imported ?? 0} {preview?.imported === 1 ? "word" : "words"}</button></div></div>
    </section>
  </div>;
}

function WordDialog({ word, onClose, onSave }) {
  const [fields, setFields] = useState({ word: word?.word || "", definition: word?.definition || "", partOfSpeech: word?.partOfSpeech || "", example: word?.example || "", note: word?.note || "", category: word?.category || "general" });
  const [error, setError] = useState("");
  function update(field, value) { setFields((current) => ({ ...current, [field]: value })); setError(""); }
  function submit(event) { event.preventDefault(); if (!fields.word.trim() || !fields.definition.trim()) { setError("Add a word and its meaning to save this entry."); return; } const result = onSave(fields); if (result?.error) setError(result.error); }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="word-dialog" role="dialog" aria-modal="true" aria-labelledby="word-dialog-title"><div className="dialog-heading"><div><p className="page-eyebrow">YOUR PERSONAL WORD JOURNAL</p><h2 id="word-dialog-title">{word ? "Edit word" : "Add a new word"}</h2></div><button className="dialog-close" type="button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div><form className="word-form" onSubmit={submit}><Field label="Word"><input autoFocus value={fields.word} onChange={(event) => update("word", event.target.value)} placeholder="e.g. ephemeral" maxLength={80} required /></Field><Field label="Meaning"><textarea value={fields.definition} onChange={(event) => update("definition", event.target.value)} placeholder="What does this word mean?" maxLength={600} required /></Field><div className="form-two-col"><Field label="Part of speech"><input value={fields.partOfSpeech} onChange={(event) => update("partOfSpeech", event.target.value)} placeholder="adjective, noun..." maxLength={40} /></Field><Field label="Collection"><select value={fields.category} onChange={(event) => update("category", event.target.value)}>{CATEGORY_KEYS.map((key) => <option key={key} value={key}>{CATEGORY_META[key].label}</option>)}</select></Field></div><Field label="Example sentence"><textarea value={fields.example} onChange={(event) => update("example", event.target.value)} placeholder="A sentence that helps you remember it" maxLength={400} /></Field><Field label="Personal note"><textarea value={fields.note} onChange={(event) => update("note", event.target.value)} placeholder="Anything you want to remember" maxLength={300} /></Field>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-footer"><span><span className="status-dot" /> Saved privately in this browser</span><div><button className="text-button" type="button" onClick={onClose}>Cancel</button><button className="primary-action" type="submit"><Check size={15} /> {word ? "Save changes" : "Add word"}</button></div></div></form></section></div>;
}

function Field({ label, children }) { return <label className="form-field"><span>{label}</span>{children}</label>; }

function ReviewView({ word, index, count, revealed, onReveal, onRate, onBack }) {
  if (!word) return <section className="review-empty"><span className="review-empty-art"><BookOpen size={24} /></span><p className="page-eyebrow">A MOMENT TO REVISIT</p><h1>Your deck is waiting.</h1><p>Add a few words to your library, then come back to practice them here.</p><button className="primary-action" type="button" onClick={onBack}><ArrowLeft size={15} /> Back to your library</button></section>;
  return <section className="review-view"><div className="review-title"><div><p className="page-eyebrow">A MOMENT TO REVISIT</p><h1>Keep the words <em>close.</em></h1><p>Think of the meaning before you turn the card.</p></div><button className="subtle-action" type="button" onClick={onBack}><ArrowLeft size={15} /> Library</button></div><div className="review-progress"><span>WORD {index % count + 1} OF {count}</span><span>{word.reviewCount || 0} reviews</span></div><button className={`flashcard ${revealed ? "revealed" : ""}`} type="button" onClick={onReveal} aria-label={revealed ? "Hide definition" : "Reveal definition"}><span className="flashcard-label">{revealed ? "MEANING" : "YOUR TURN"}</span>{revealed ? <><h2>{word.definition}</h2>{word.example && <blockquote>{word.example}</blockquote>}{word.note && <span className="flashcard-note">Your note · {word.note}</span>}</> : <><h2>{word.word}</h2><span className="flashcard-part">{word.partOfSpeech || CATEGORY_META[word.category]?.label || "Word"}</span><span className="tap-hint"><Eye size={14} /> Tap to reveal</span></>}</button><div className="review-controls">{revealed ? <><button type="button" className="review-again" onClick={() => onRate(false)}>Still learning <ArrowLeft size={14} /></button><span className="keyboard-hint"><kbd>←</kbd> still learning <kbd>→</kbd> mastered</span><button type="button" className="review-known" onClick={() => onRate(true)}><Check size={15} /> Got it</button></> : <span className="keyboard-hint"><kbd>Space</kbd> reveal card</span>}</div></section>;
}

function StatsView({ words, masteredCount, categories }) {
  const reviewCount = words.reduce((sum, word) => sum + (word.reviewCount || 0), 0);
  const maxCount = Math.max(1, ...categories.map((category) => category.count));
  return <section className="stats-view"><p className="page-eyebrow">YOUR PROGRESS</p><h1>A little progress,<br /><em>every day.</em></h1><p className="stats-intro">Your vocabulary grows one saved word at a time.</p><div className="stats-overview"><StatCard label="TOTAL WORDS" value={words.length} note="in your collection" icon={LibraryBig} /><StatCard label="MASTERED" value={masteredCount} note="marked remembered" icon={Check} accent /><StatCard label="REVIEWS" value={reviewCount} note="cards practiced" icon={BookOpen} /></div><section className="category-chart"><div className="chart-heading"><h2>Your collections</h2><span>{words.length} words total</span></div>{categories.map((category) => <div key={category.key} className="chart-row"><span><CategoryIcon category={category.key} size={15} /> {category.label}</span><div className="chart-track"><span style={{ width: `${Math.round(category.count / maxCount * 100)}%` }} /></div><strong>{category.count}</strong></div>)}</section></section>;
}

function SettingsView({ onImport, onExport, onClear, wordCount, storageError }) {
  return <section className="settings-view"><p className="page-eyebrow">YOUR PREFERENCES</p><h1>Settings<span className="title-period">.</span></h1><p className="settings-intro">Your vocabulary stays in this browser. Export a backup regularly; clearing browser data can erase it.</p><div className="settings-section"><h2>Local data</h2><p>{wordCount} {wordCount === 1 ? "word" : "words"} saved on this device.</p>{storageError && <p className="form-error" role="alert">{storageError}</p>}<div className="settings-actions"><button className="subtle-action" type="button" onClick={onImport}><Upload size={15} /> Restore backup</button><button className="subtle-action" type="button" onClick={() => onExport("json")}><Download size={15} /> Export backup</button><button className="settings-danger" type="button" onClick={onClear} disabled={!wordCount}><Trash2 size={15} /> Clear local library</button></div><p className="settings-note"><span className="status-dot" /> No account or backend is connected.</p></div><div className="settings-section"><h2>About LexiTrack</h2><p>Keep the words you find meaningful, and return to them when you’re ready.</p></div></section>;
}

function speakWord(word) {
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(word));
}

export default App;
