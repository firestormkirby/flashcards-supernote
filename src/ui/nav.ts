import type {PracticeFilter} from '../core/library';
import type {CardImage} from '../core/model';
import type {CardDraft} from './CardEditor';

/** The bottom-bar sections. */
export type Tab = 'home' | 'starred' | 'search' | 'import' | 'settings';

/** Screens opened on top of a tab. */
export type Route =
  | {name: 'folder'; id: string}
  | {name: 'deck'; id: string}
  | {
      name: 'study';
      deckIds: string[];
      title: string;
      practice: boolean;
      /** Exactly these cards (Practice, Starred), when given. */
      cardIds?: string[];
      /** For Study: only the due / new cards this All / Due / New / Starred choice picks. */
      filters: PracticeFilter[];
    }
  | {name: 'allCards'; deckId: string}
  /**
   * Edit `cardId`, or write a new card when it is null. A new card goes into
   * `deckId` if given; otherwise the editor asks which deck, starting in `folderHint`.
   */
  | {
      name: 'editCard';
      deckId: string | null;
      cardId: string | null;
      folderHint?: string | null;
      draft?: CardDraft;
    }
  /** Mark a region of a captured page; the result opens as a new card. */
  | {name: 'cropPicture'; image: CardImage; source?: string}
  /** Move decks / folders (all from the same place) into another folder. */
  | {name: 'moveItems'; deckIds: string[]; folderIds: string[]};

export interface Nav {
  go(route: Route): void;
  back(): void;
  /** Replace the top screen (e.g. a new deck's page in place of the "new deck" flow). */
  replace(route: Route): void;
  /** Straight back to Home from any depth. */
  home(): void;
  /** Close the panel and return to the note. */
  close(): void;
  /** The folder the user is looking at, so "New" creates things there. */
  hereFolder(): string | null;
  hereDeck(): string | null;
}
