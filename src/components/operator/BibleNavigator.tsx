import { useState, useMemo, useCallback } from 'react';
import { BibleRepository } from '@/core/bibleRepository';
import { useStateManager } from '@/core/stateManager';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronLeft, BookOpen, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';

type NavLevel = 'books' | 'chapters' | 'verses';

const OT_BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles',
  'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
  'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah',
  'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah',
  'Haggai', 'Zechariah', 'Malachi',
];

const NT_BOOKS = [
  'Matthew', 'Mark', 'Luke', 'John', 'Acts',
  'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
  'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
  '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
  'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John',
  'Jude', 'Revelation',
];

export function BibleNavigator() {
  const [level, setLevel] = useState<NavLevel>('books');
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);

  const { buildQueueFromPassage, buildQueueFromChapter, currentTranslation } = useStateManager();

  const allBooks = useMemo(() => BibleRepository.getAllBooks(), []);

  // Filter to only books that are actually loaded
  const otBooks = useMemo(() => OT_BOOKS.filter(b => allBooks.some(ab => ab.toLowerCase() === b.toLowerCase())), [allBooks]);
  const ntBooks = useMemo(() => NT_BOOKS.filter(b => allBooks.some(ab => ab.toLowerCase() === b.toLowerCase())), [allBooks]);

  const chapters = useMemo(() => {
    if (!selectedBook) return [];
    return BibleRepository.getChapters(selectedBook);
  }, [selectedBook]);

  const verses = useMemo(() => {
    if (!selectedBook || !selectedChapter) return [];
    return BibleRepository.getVerses(selectedBook, selectedChapter);
  }, [selectedBook, selectedChapter]);

  const handleBookClick = useCallback((book: string) => {
    setSelectedBook(book);
    setSelectedChapter(null);
    setLevel('chapters');
  }, []);

  const handleChapterClick = useCallback((chapter: string) => {
    setSelectedChapter(chapter);
    setLevel('verses');
  }, []);

  const handleProjectChapter = useCallback(() => {
    if (!selectedBook || !selectedChapter) return;
    buildQueueFromChapter(selectedBook, selectedChapter);
  }, [selectedBook, selectedChapter, buildQueueFromChapter]);

  const handleVerseClick = useCallback((verseNum: string) => {
    if (!selectedBook || !selectedChapter) return;
    const passage = BibleRepository.getPassage({
      book: selectedBook,
      chapter: selectedChapter,
      verseStart: verseNum,
      translation: currentTranslation,
    });
    if (passage) {
      buildQueueFromPassage(passage);
    }
  }, [selectedBook, selectedChapter, buildQueueFromPassage, currentTranslation]);

  const goBack = useCallback(() => {
    if (level === 'verses') {
      setLevel('chapters');
      setSelectedChapter(null);
    } else if (level === 'chapters') {
      setLevel('books');
      setSelectedBook(null);
    }
  }, [level]);

  const breadcrumb = level === 'books'
    ? 'Browse Bible'
    : level === 'chapters'
      ? selectedBook
      : `${selectedBook} ${selectedChapter}`;

  const BookColumn = ({ title, books }: { title: string; books: string[] }) => (
    <div className="flex-1 min-w-0">
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest px-1 pb-1">{title}</p>
      <div className="space-y-px">
        {books.map((book) => (
          <button
            key={book}
            onClick={() => handleBookClick(book)}
            className="w-full flex items-center justify-between px-2 py-1 rounded text-xs text-left hover:bg-accent transition-colors group"
          >
            <span className="truncate text-foreground">{book}</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="px-2 py-2">
      {/* Breadcrumb / Back */}
      {level !== 'books' && (
        <div className="flex items-center gap-1.5 px-1 py-1.5 mb-1">
          <button
            onClick={goBack}
            className="p-0.5 rounded hover:bg-accent"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <span className="text-xs font-medium text-foreground">{breadcrumb}</span>
        </div>
      )}

      {level === 'books' && (
        <div className="flex gap-2">
          <BookColumn title="Old Testament" books={otBooks} />
          <div className="w-px bg-border shrink-0" />
          <BookColumn title="New Testament" books={ntBooks} />
        </div>
      )}

      {level === 'chapters' && (
        <div className="grid grid-cols-5 gap-0.5">
          {chapters.map((ch) => (
            <button
              key={ch}
              onClick={() => handleChapterClick(ch)}
              className="flex items-center justify-center h-8 rounded text-sm font-medium hover:bg-accent text-foreground transition-colors"
            >
              {ch}
            </button>
          ))}
        </div>
      )}

      {level === 'verses' && (
        <div className="space-y-1.5">
          <Button
            onClick={handleProjectChapter}
            variant="secondary"
            size="sm"
            className="w-full text-xs gap-1.5 h-7"
          >
            <Layers className="h-3 w-3" />
            Load Full Chapter
          </Button>
          <div className="grid grid-cols-5 gap-0.5">
            {verses.map((v) => (
              <button
                key={v.verse}
                onClick={() => handleVerseClick(v.verse)}
                className="flex items-center justify-center h-8 rounded text-sm font-medium hover:bg-accent text-foreground transition-colors"
              >
                {v.verse}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
