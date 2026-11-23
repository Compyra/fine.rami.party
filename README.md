# fine.rami.party

**THIS IS FINE.** — the internet's most beautiful disaster generator.

An interactive take on the "This Is Fine" meme: pick who is keeping calm, what they are
sipping, how they are coping and where it is all burning down. The scene is illustrated
live in SVG, with the fire, embers, smoke and heat shimmer drawn on canvas.

Plain HTML, CSS and JavaScript. No frameworks, no build step, no assets to bundle.

```
index.html   page shell, icon sprite, studio panel markup
style.css    design tokens, layout, every CSS animation
script.js    scene art, lettering, canvas FX, camera, sound, export, UI
```

## Running it

Serve the folder with any static file server and open it, for example:

```
npx serve .
```

Opening `index.html` straight from disk works too.

## How it behaves

- **First visit** shows the original — dog, coffee, burning room — full screen behind the
  headline, with a couple of easter eggs that change on every load.
- **Create My Disaster** opens the studio. Every change updates the scene immediately and
  is saved to `localStorage`, so the next visit opens straight onto that creation.
- **Customize text** (in the studio) lists every piece of lettering in the current scene —
  the speech bubble, signs, screens, the mug, the book, even the easter eggs — as a text
  field. Typing rewrites it live; the lettering being edited lights up and the camera pans
  to it. Long text shrinks to fit its sign, and an empty field falls back to the original.
  A speech bubble line of your own stays put instead of rotating through the built-in
  quips.
- **Share** copies a link that rebuilds the scene from its query string:

  ```
  ?character=dog&drink=coffee&activity=laptop&environment=office&chaos=apocalyptic&t.say=Ship+it
  ```

  | Parameter     | Values                                                                 |
  | ------------- | ---------------------------------------------------------------------- |
  | `character`   | `dog` `cat` `human` `robot` `alien`                                    |
  | `drink`       | `coffee` `tea` `cocoa` `energy` `wine`                                 |
  | `activity`    | `laptop` `book` `phone` `quiet` `gaming`                               |
  | `environment` | `classic` `office` `living` `street` `boardroom` `space` `cyberpunk`   |
  | `chaos`       | `mild` `serious` `catastrophic` `apocalyptic`                          |
  | `t.<slot>`    | Custom text for one piece of lettering (see below)                     |

  A shared link is shown as-is and only replaces the visitor's own saved creation once
  they edit it.
- **Screenshot** exports the current frame as a PNG, custom text included.
- **Sound** is synthesised with Web Audio and stays off until asked for.

### Text slots

Only rewritten slots appear in a share link. Custom text is treated as plain text: it is
trimmed, capped in length and escaped before it reaches the page.

| Where                | Slots                                                             |
| -------------------- | ----------------------------------------------------------------- |
| Character            | `say` (speech bubble)                                             |
| On the table         | `mug` `book` `mail1` `mail2` `mail3` (laptop) `game1` `game2` (monitor) |
| Modern Office        | `exit` `board` `notes` (comma-separated) `bsod`                   |
| Living Room          | `tv` `ticker` `live`                                              |
| City Street          | `shop` `door` `hours` `menu`                                      |
| Corporate Boardroom  | `slide` `outlook` `verdict` `brass`                               |
| Space Station        | `hull` `oxygen`                                                   |
| Cyberpunk Apartment  | `holo` `neon` `poster`                                            |
| Easter eggs          | `sticky` `chirp` `tank`                                           |

## Keyboard

| Key       | Action                              |
| --------- | ----------------------------------- |
| `C`       | Open / close the studio             |
| `T`       | Open / close the text editor        |
| `R`       | Random chaos                        |
| `1` – `4` | Disaster level                      |
| `S`       | Save a screenshot                   |
| `L`       | Copy the share link                 |
| `M`       | Sound on / off                      |
| `Esc`     | Back out of the text editor, then close the studio |

Shortcuts are ignored while typing in a text field.

## Performance and accessibility

Effects scale themselves back if the frame rate drops; append `?fx=high`, `?fx=medium` or
`?fx=low` to pin a quality tier. With `prefers-reduced-motion` the fire slows to a crawl,
camera moves cut instead of gliding, and shake, flashes and parallax are switched off.
Every control is reachable by keyboard and labelled for screen readers; the dock's disaster
level is a radio group driven by the arrow keys.