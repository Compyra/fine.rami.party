# fine.rami.party

**THIS IS FINE.** — the internet's most beautiful disaster generator.

An interactive take on the "This Is Fine" meme: pick who is keeping calm, what they are
sipping, how they are coping and where it is all burning down. The scene is illustrated
live in SVG, with the fire, embers, smoke and heat shimmer drawn on canvas.

Plain HTML, CSS and JavaScript. No frameworks, no build step, no assets to bundle.

```
index.html   page shell, icon sprite, studio panel markup
style.css    design tokens, layout, every CSS animation
script.js    scene art, canvas FX, camera, sound, export, UI
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
- **Share** copies a link that rebuilds the scene from its query string:

  ```
  ?character=dog&drink=coffee&activity=laptop&environment=office&chaos=apocalyptic
  ```

  | Parameter     | Values                                                                 |
  | ------------- | ---------------------------------------------------------------------- |
  | `character`   | `dog` `cat` `human` `robot` `alien`                                    |
  | `drink`       | `coffee` `tea` `cocoa` `energy` `wine`                                 |
  | `activity`    | `laptop` `book` `phone` `quiet` `gaming`                               |
  | `environment` | `classic` `office` `living` `street` `boardroom` `space` `cyberpunk`   |
  | `chaos`       | `mild` `serious` `catastrophic` `apocalyptic`                          |

  A shared link is shown as-is and only replaces the visitor's own saved creation once
  they edit it.
- **Screenshot** exports the current frame as a PNG.
- **Sound** is synthesised with Web Audio and stays off until asked for.

## Keyboard

| Key       | Action                 |
| --------- | ---------------------- |
| `C`       | Open / close the studio |
| `R`       | Random chaos           |
| `1` – `4` | Disaster level         |
| `S`       | Save a screenshot      |
| `L`       | Copy the share link    |
| `M`       | Sound on / off         |
| `Esc`     | Close the studio       |

## Performance and accessibility

Effects scale themselves back if the frame rate drops; append `?fx=high`, `?fx=medium` or
`?fx=low` to pin a quality tier. With `prefers-reduced-motion` the fire slows to a crawl,
camera moves cut instead of gliding, and shake, flashes and parallax are switched off.
Every control is reachable by keyboard and labelled for screen readers.