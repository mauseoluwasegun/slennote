import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Search, X, Loader2, Calendar, FileText, CheckCircle2, Circle } from "lucide-react";
import { format } from "date-fns";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDate: (date?: string, noteId?: string, fullPageNoteId?: string) => void;
}

export function SearchModal({ isOpen, onClose, onSelectDate }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const searchResults = useQuery(api.search.searchAll, {
    searchQuery: debouncedQuery,
  });

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleResultClick = (result: any) => {
    if (result.type === "todo") {
      onSelectDate(result.date, undefined, undefined);
    } else if (result.type === "note") {
      onSelectDate(result.date, result._id, undefined);
    } else if (result.type === "fullPageNote") {
      onSelectDate(result.date, undefined, result._id);
    }
    onClose();
  };

  return createPortal(
    <div className="search-modal-overlay" onClick={onClose}>
      <div
        className="search-modal"
        onClick={e => e.stopPropagation()}
      >
        <div className="search-modal-header">
          <Search className="search-icon" size={20} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search todos, notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-input"
          />
          {query && (
            <button onClick={() => setQuery("")} className="clear-search">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="search-results">
          {debouncedQuery && searchResults === undefined && (
            <div className="search-loading">
              <Loader2 className="animate-spin" size={24} />
            </div>
          )}

          {searchResults && searchResults.length === 0 && debouncedQuery && (
            <div className="search-empty">
              No results found for "{debouncedQuery}"
            </div>
          )}

          {searchResults && searchResults.map((result: any) => (
            <div
              key={result._id}
              className="search-result-item"
              onClick={() => handleResultClick(result)}
            >
              <div className="result-icon">
                {result.type === 'todo' ? (
                  result.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />
                ) : (
                  <FileText size={16} />
                )}
              </div>
              <div className="result-content">
                <div className="result-text">{result.title || result.content}</div>
                {result.date && (
                  <div className="result-meta">
                    <Calendar size={12} />
                    <span>{format(new Date(result.date), "MMM d, yyyy")}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}