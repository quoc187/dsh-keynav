window.__ModuleLoader__.load({
  id: 'dsh-keynav',
  factory(require) {
    /** Composer takeovers this plugin drives. */
    const QUESTION_PANEL = '[data-question-key]';
    const PLAN_PANEL = '[data-plan-review-key]';
    const APPROVAL_PANEL = '[data-approval-key]';
    const ANY_PANEL = `${QUESTION_PANEL}, ${PLAN_PANEL}, ${APPROVAL_PANEL}`;

    /** Debug switch: `localStorage.setItem('dsh-keynav:debug', '1')`. */
    const DEBUG = () => {
      try {
        return window.localStorage.getItem('dsh-keynav:debug') === '1';
      } catch {
        return false;
      }
    };
    const log = (...args) => {
      if (DEBUG()) console.info('[keynav]', ...args);
    };

    /**
     * Option buttons of the stock question card, in visual order.
     *
     * An option row also holds its description-expand chevron, which is a
     * sibling button — matching on `[role]` keeps only the choices.
     */
    const optionButtons = (panel) =>
      Array.from(
        panel.querySelectorAll(
          '[data-option-row] > button[role="radio"], [data-option-row] > button[role="checkbox"]',
        ),
      );

    /** The free-text answer box, when the question shows one. */
    const answerField = (panel) => panel.querySelector('textarea');

    /**
     * Focus styling for the option rows.
     *
     * The stock card has no `:focus` rule of its own, so the browser paints its
     * default ring — a hard black rectangle offset inside the row's transparent
     * border, which reads as a stray box rather than a cursor. Options therefore
     * drop the UA outline and the row takes the same background the hover state
     * uses, so keyboard and pointer agree. Text inputs keep native focus.
     */
    const ROW_FOCUS_CSS = `
[data-question-key] [data-option-row] > button[role="radio"],
[data-question-key] [data-option-row] > button[role="checkbox"],
[data-question-key] [data-option-row] > button[role="radio"]:focus,
[data-question-key] [data-option-row] > button[role="checkbox"]:focus,
[data-question-key] [data-option-row] > button[role="radio"]:focus-visible,
[data-question-key] [data-option-row] > button[role="checkbox"]:focus-visible {
	outline: none !important;
	box-shadow: none !important;
}
[data-question-key] [data-option-row]:focus-within {
	background: var(--dsw-alias-interactive-bg-hover);
	box-shadow: inset 0 0 0 1.5px var(--dsw-alias-state-business-primary);
}
`;

    /** Install the focus stylesheet once per page. */
    const installStyles = () => {
      if (document.querySelector('style[data-dsh-keynav]') !== null) return;
      const style = document.createElement('style');
      style.dataset.dshKeynav = 'true';
      style.textContent = ROW_FOCUS_CSS;
      document.head.appendChild(style);
    };

    /** True when the event happened inside a text control we must not hijack. */
    const inTextControl = (target) =>
      target instanceof Element &&
      target.closest('textarea, input, select, [contenteditable="true"], [contenteditable=""]') !== null;

    /**
     * Whether an arrow key is trying to leave a text box rather than move the
     * caret: `↑` at the very start, `↓` at the very end, with no selection.
     *
     * Everything else stays native, so ordinary editing is never hijacked.
     */
    const arrowLeavesField = (field, key) => {
      if (field.selectionStart !== field.selectionEnd) return false;
      if (key === 'ArrowUp') return field.selectionStart === 0;
      if (key === 'ArrowDown') return field.selectionStart === field.value.length;
      return false;
    };

    /**
     * Question card: every option plus the free-text row, in tab order.
     * Other panels: the buttons of the decision row.
     */
    const navItems = (panel) => {
      if (panel.matches(QUESTION_PANEL)) {
        const items = optionButtons(panel);
        const field = answerField(panel);
        if (field !== null) items.push(field);
        return items;
      }
      const buttons = Array.from(panel.querySelectorAll('button')).filter((button) => !button.disabled);
      const group = panel.matches(PLAN_PANEL) ? decisionRow(panel) : buttons;
      return group.filter((button) => !button.disabled);
    };

    /** The last div holding buttons in a panel footer — the Submit/Next pair. */
    const decisionRow = (panel) => {
      const footer = panel.querySelector('footer');
      if (footer === null) return [];
      const groups = Array.from(footer.querySelectorAll('div')).filter((div) => div.querySelector('button') !== null);
      const actions = groups[groups.length - 1];
      return actions === undefined ? [] : Array.from(actions.querySelectorAll('button'));
    };

    /** The panel's own "1 / 3" progress marker, used to detect a question change. */
    const progressNode = (panel) => {
      for (const node of panel.querySelectorAll('footer span')) {
        if (/^\d+\s*\/\s*\d+$/.test((node.textContent ?? '').trim())) return node;
      }
      return null;
    };

    /** Previous/next step controls, which sit beside the "1 / 3" marker. */
    const pagerOf = (panel) => {
      const group = progressNode(panel)?.parentElement ?? null;
      if (group === null) return { prev: undefined, next: undefined };
      const buttons = Array.from(group.querySelectorAll('button'));
      return { prev: buttons[0], next: buttons[buttons.length - 1] };
    };

    /**
     * Move one step. Deliberately not circular: the pager disables itself at
     * either end, so `←` on the first question and `→` on the last do nothing.
     */
    const step = (panel, direction) => {
      const { prev, next } = pagerOf(panel);
      const target = direction < 0 ? prev : next;
      if (target === undefined || target.disabled) return;
      target.click();
    };

    /** Caret helpers for leaving a text box only from its edges. */
    const caretAtStart = (field) =>
      field.selectionStart === 0 && field.selectionEnd === 0;
    const caretAtEnd = (field) =>
      field.selectionStart === field.value.length && field.selectionEnd === field.value.length;

    /**
     * Identity of what the panel currently shows. Focus is restored only when
     * this changes, so re-renders and typing never steal the caret.
     */
    const signatureOf = (panel) => {
      const progress = progressNode(panel)?.textContent?.trim() ?? '';
      const labels = optionButtons(panel)
        .map((button) => button.getAttribute('aria-label') ?? '')
        .join('\u0000');
      return `${panel.getAttribute('data-question-key') ?? panel.getAttribute('data-plan-review-key') ?? ''}|${progress}|${labels}`;
    };

    /** Focus what a keyboard user should land on when a panel appears. */
    const focusInitial = (panel) => {
      const items = navItems(panel);
      if (items.length === 0) return;
      if (panel.matches(QUESTION_PANEL)) {
        const selected = items.find(
          (item) => item instanceof Element && item.getAttribute('aria-checked') === 'true',
        );
        const target = selected ?? items[0];
        target.focus({ preventScroll: true });
        log('focused option', target.getAttribute('aria-label'));
        return;
      }
      const primary = items[items.length - 1];
      primary.focus({ preventScroll: true });
      log('focused action', primary.textContent);
    };

    /** Focus once per distinct panel state. */
    const maybeFocus = (panel) => {
      const signature = signatureOf(panel);
      if (panel.dataset.keynavSignature === signature) return;
      panel.dataset.keynavSignature = signature;
      focusInitial(panel);
    };

    /**
     * Restore focus after a re-render replaced the focused node.
     *
     * Only reacts when focus fell to the document body: moving focus away to a
     * real control is the user's choice and is left alone.
     */
    const ensureFocus = (panel) => {
      if (!panel.isConnected) return;
      if (panel.contains(document.activeElement)) return;
      if (document.activeElement !== null && document.activeElement !== document.body) return;
      const items = navItems(panel);
      if (items.length === 0) return;
      items[0].focus({ preventScroll: true });
      log('restored focus after re-render');
    };

    /** Read the "1 / 3" progress text, used to detect that Enter advanced. */
    const progressText = (panel) => progressNode(panel)?.textContent?.trim() ?? '';

    /** Click the panel's primary action (Submit, Next, Approve, Allow…). */
    const clickPrimary = (panel) => {
      if (!panel.matches(QUESTION_PANEL)) {
        const items = navItems(panel);
        const primary = items[items.length - 1];
        if (primary !== undefined && !primary.disabled) primary.click();
        return;
      }
      const row = decisionRow(panel);
      const primary = row[row.length - 1];
      if (primary === undefined) return;
      log('primary', primary.textContent, primary.disabled ? '(disabled)' : '');
      if (!primary.disabled) primary.click();
    };

    /**
     * Enter on a radio: commit the highlighted choice, then submit if that did
     * not already advance to the next question (a single-select click advances).
     */
    const commitThenSubmit = (panel, target, buttons) => {
      const isOption = buttons.includes(target);
      const isRadio = target.getAttribute('role') === 'radio';
      const selected = target.getAttribute('aria-checked') === 'true';
      if (!isOption || !isRadio || selected) {
        clickPrimary(panel);
        return;
      }
      const before = progressText(panel);
      target.click();
      window.setTimeout(() => {
        if (!panel.isConnected) return;
        if (progressText(panel) !== before) return;
        clickPrimary(panel);
      }, 0);
    };

    /** Move focus through a panel's navigation items. */
    const move = (event, panel) => {
      const items = navItems(panel);
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement);
      const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
      const next =
        current < 0
          ? items[forward ? 0 : items.length - 1]
          : items[(current + (forward ? 1 : -1) + items.length) % items.length];
      event.preventDefault();
      next.focus({ preventScroll: true });
      log('moved to', next.getAttribute?.('aria-label') ?? next.tagName);
    };

    /**
     * Resolve the panel a key event belongs to.
     *
     * Focus normally sits inside the card, but a re-render can drop it to
     * `<body>`; there the closest panel is null and the key would be lost. When
     * exactly one panel is on screen and the user is not typing somewhere, that
     * panel is the intended target.
     */
    const panelFor = (target) => {
      const owned = target.closest(ANY_PANEL);
      if (owned !== null) return owned;
      if (target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') !== null) return null;
      const panels = document.querySelectorAll(ANY_PANEL);
      return panels.length === 1 ? panels[0] : null;
    };

    /** One capture-phase key handler for every panel. */
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;

      const panel = panelFor(event.target);
      if (panel === null) return;

      const arrows =
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight';

      const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;

      if (arrows) {
        // Inside a text box the arrow edits the caret until it reaches an edge.
        if (inTextControl(event.target)) {
          const field = event.target.closest('textarea');
          if (field === null) return;
          if (vertical) {
            if (!arrowLeavesField(field, event.key)) return;
            move(event, panel);
            return;
          }
          const atEdge = direction < 0 ? caretAtStart(field) : caretAtEnd(field);
          if (!atEdge) return;
        }

        // On the question card, left/right change step; up/down walk the ring.
        if (horizontal && panel.matches(QUESTION_PANEL)) {
          event.preventDefault();
          step(panel, direction);
          return;
        }
        if (vertical && panel.matches(QUESTION_PANEL)) {
          move(event, panel);
          return;
        }
        // Approval and plan-review cards keep all four arrows on their buttons.
        move(event, panel);
        return;
      }

      if (!panel.matches(QUESTION_PANEL)) return;

      if (inTextControl(event.target)) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        commitThenSubmit(panel, event.target, optionButtons(panel));
        return;
      }

      if (event.key === ' ' || event.key === 'Spacebar') {
        // Native activation already toggles a checkbox and picks a radio.
        return;
      }

      if (/^[1-9]$/.test(event.key)) {
        const buttons = optionButtons(panel);
        const target = buttons[Number(event.key) - 1];
        if (target === undefined) return;
        event.preventDefault();
        target.focus({ preventScroll: true });
        target.click();
      }
    };

    /** Watch for panels appearing and for questions changing inside one. */
    const observe = () => {
      const seen = new WeakSet();

      /** Coalesce a burst of mutations into one focus decision per frame. */
      const schedule = new WeakMap();

      const watch = (panel) => {
        if (seen.has(panel)) return;
        seen.add(panel);
        maybeFocus(panel);

        // Re-focus when the card advances to another question. Throttled to a
        // frame so typing in the answer box never queues a focus storm.
        const observer = new MutationObserver(() => {
          if (schedule.has(panel)) return;
          schedule.set(
            panel,
            requestAnimationFrame(() => {
              schedule.delete(panel);
              if (!panel.isConnected) return;
              maybeFocus(panel);
              ensureFocus(panel);
            }),
          );
        });
        observer.observe(panel, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      };

      const visit = (node) => {
        if (!(node instanceof Element)) return;
        if (node.matches(ANY_PANEL)) watch(node);
        for (const panel of node.querySelectorAll(ANY_PANEL)) watch(panel);
      };

      const rootObserver = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) visit(node);
        }
      });
      rootObserver.observe(document.body, { childList: true, subtree: true });

      for (const panel of document.querySelectorAll(ANY_PANEL)) watch(panel);

      return () => {
        rootObserver.disconnect();
        document.removeEventListener('keydown', onKeyDown, true);
      };
    };

    return {
      inject: [],
      apply(ctx) {
        installStyles();
        document.addEventListener('keydown', onKeyDown, true);
        const stop = observe();
        const dispose = () => {
          stop();
        };
        if (typeof ctx?.effect === 'function') ctx.effect(() => dispose, 'dsh-keynav: keyboard navigation');
        console.info('[keynav] keyboard navigation active');
      },
    };
  },
});
