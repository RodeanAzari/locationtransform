/** Search box with an autocomplete list (ARIA combobox; ↑/↓/Enter/Esc and mouse). */

export interface Suggestion {
  id: string;
  title: string;
  /** Secondary text, e.g. "Province, Canada". */
  detail: string;
}

export interface SearchBoxOptions {
  placeholder: string;
  /** Returns suggestions for a query. */
  suggest(query: string): Suggestion[];
  onSelect(suggestion: Suggestion): void;
}

let instances = 0;

export class SearchBox {
  readonly element: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLUListElement;
  private readonly listId = `search-list-${instances++}`;
  private suggestions: Suggestion[] = [];
  private active = -1;

  constructor(private readonly options: SearchBoxOptions) {
    this.element = document.createElement('div');
    this.element.className = 'search-box';
    this.element.innerHTML = `
      <input type="search" role="combobox" autocomplete="off" spellcheck="false"
        aria-autocomplete="list" aria-expanded="false" aria-controls="${this.listId}" />
      <ul role="listbox" id="${this.listId}" hidden></ul>`;
    this.input = this.element.querySelector('input')!;
    this.list = this.element.querySelector('ul')!;
    this.input.placeholder = options.placeholder;
    this.input.setAttribute('aria-label', options.placeholder);

    this.input.addEventListener('input', () => this.update());
    this.input.addEventListener('focus', () => this.update());
    this.input.addEventListener('blur', () => this.close());
    this.input.addEventListener('keydown', (event) => this.onKey(event));
    // mousedown (not click) so the input doesn't blur and close the list first.
    this.list.addEventListener('mousedown', (event) => {
      const option = (event.target as HTMLElement).closest<HTMLElement>('[role="option"]');
      if (!option) return;
      event.preventDefault();
      this.select(Number(option.dataset.index));
    });
  }

  focus(): void {
    this.input.focus();
  }

  private update(): void {
    this.suggestions = this.options.suggest(this.input.value);
    this.active = -1;
    this.render();
  }

  private render(): void {
    this.list.replaceChildren(
      ...this.suggestions.map((s, i) => {
        const item = document.createElement('li');
        item.id = `${this.listId}-${i}`;
        item.role = 'option';
        item.dataset.index = String(i);
        item.setAttribute('aria-selected', String(i === this.active));
        item.setAttribute('aria-label', `${s.title} — ${s.detail}`);
        const title = document.createElement('span');
        title.className = 'title';
        title.textContent = s.title;
        const detail = document.createElement('span');
        detail.className = 'detail';
        detail.textContent = s.detail;
        item.append(title, detail);
        return item;
      }),
    );
    const open = this.suggestions.length > 0;
    this.list.hidden = !open;
    this.input.setAttribute('aria-expanded', String(open));
    if (this.active >= 0) {
      this.input.setAttribute('aria-activedescendant', `${this.listId}-${this.active}`);
      this.list.children[this.active].scrollIntoView({ block: 'nearest' });
    } else {
      this.input.removeAttribute('aria-activedescendant');
    }
  }

  private close(): void {
    this.suggestions = [];
    this.active = -1;
    this.render();
  }

  private select(index: number): void {
    const suggestion = this.suggestions[index];
    if (!suggestion) return;
    this.input.value = '';
    this.close();
    this.input.blur();
    this.options.onSelect(suggestion);
  }

  private onKey(event: KeyboardEvent): void {
    const count = this.suggestions.length;
    switch (event.key) {
      case 'ArrowDown':
        if (count === 0) this.update();
        else this.active = (this.active + 1) % count;
        break;
      case 'ArrowUp':
        if (count > 0) this.active = this.active <= 0 ? count - 1 : this.active - 1;
        break;
      case 'Enter':
        this.select(Math.max(this.active, 0));
        break;
      case 'Escape':
        if (count === 0) this.input.value = '';
        this.close();
        break;
      default:
        return;
    }
    event.preventDefault();
    this.render();
  }
}
