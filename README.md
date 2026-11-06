# dsh-keynav

Claude-Code-style keyboard navigation for the DSH web panels that take over the
composer.

| Key | Question card | Plan review / approval |
| --- | --- | --- |
| `↑` `↓` | walk the ring: options, then the free-text box, wrapping at both ends | move between the decision buttons |
| `←` `→` | previous / next question (never wraps); inside the free-text box only when the caret is already at that edge | move between the decision buttons |
| `Space` | toggle a multi-select option, pick a single-select one | activate the focused button |
| `Enter` | commit a highlighted radio, then submit / advance | activate the focused button |
| `1`–`9` | activate that numbered option | — |

Focus lands on the first option (or the already-selected one) as soon as a
question card appears, and on the primary button for plan-review and approval
cards. The focused row is drawn with the card's own hover background plus a thin
accent inset ring, so the keyboard cursor cannot be mistaken for the card's
selected state (which is a background plus a subtle border).

## How it works

A client-only plugin. It owns no React state and does not fork the stock
component: it watches for the panels' own `data-*` hooks (`data-question-key`,
`data-option-row`, `data-plan-review-key`, `data-approval-key`), keeps focus on
the right element, and drives the existing buttons with real clicks. If a future
DSH release renames those hooks the plugin goes quiet instead of breaking the
composer.

`Enter` on a question option is the one key the plugin intercepts: the stock card
submits the whole batch on `Enter`, which fails with "incomplete" when an earlier
question is still unanswered. The plugin instead commits the highlighted choice
and clicks the card's own Next/Submit button.

## Install

### From GitHub

```sh
dsh plugin --profile web add github:quoc187/dsh-keynav
node install.mjs --bundle-only    # adds "dsh-keynav" to dsh.profile.bundles
```

### From a local checkout

```sh
node install.mjs                  # link the package and register the bundle
dsh plugin --profile web install  # materialise the link
```

Either way the profile must be **restarted** afterwards: the bundle list is read
at launch, so a page refresh does not mount a new plugin.

```sh
node install.mjs --check          # is the profile pointing here?
node install.mjs --revert         # restore the pre-install package.json
```

Override the target profile with `DSH_PROFILE_DIR=/path/to/profile node install.mjs`.

## Tests

```sh
npm install --no-save jsdom
node test/keynav.test.mjs
```

The suite builds a DOM that mirrors the stock card markup and asserts focus
placement, arrow movement, native `Space` activation, `Enter` commit/submit, digit
activation, textarea pass-through, and the approval / plan-review decision rows.

## Debug

```js
localStorage.setItem('dsh-keynav:debug', '1');
```

Logs every focus decision and primary click to the console.
