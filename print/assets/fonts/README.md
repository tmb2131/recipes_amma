# Fonts

Self-hosted copies of the Google Fonts used by the website, so Typst output is byte-identical across machines. Static (non-variable) files only, since Typst 0.14 doesn't support variable fonts.

| File                       | Family               | Use                                  | License        |
| -------------------------- | -------------------- | ------------------------------------ | -------------- |
| `Italiana-Regular.ttf`     | Italiana             | Display: titles, chapter headers     | SIL OFL 1.1    |
| `cormorant-regular.ttf`    | Cormorant Garamond   | Body serif (400)                     | SIL OFL 1.1    |
| `cormorant-italic.ttf`     | Cormorant Garamond   | Body italic (400)                    | SIL OFL 1.1    |
| `cormorant-semibold.ttf`   | Cormorant Garamond   | Headings (600)                       | SIL OFL 1.1    |
| `cormorant-bold.ttf`       | Cormorant Garamond   | Strong body (700)                    | SIL OFL 1.1    |
| `inter-regular.ttf`        | Inter                | Sans labels (400)                    | SIL OFL 1.1    |
| `inter-italic.ttf`         | Inter                | Sans italic (400)                    | SIL OFL 1.1    |
| `inter-medium.ttf`         | Inter                | Sans medium (500) — folios           | SIL OFL 1.1    |
| `inter-semibold.ttf`       | Inter                | Sans semibold (600) — section labels | SIL OFL 1.1    |

Refresh from upstream:

```bash
curl -L -o Italiana-Regular.ttf \
  "https://github.com/google/fonts/raw/main/ofl/italiana/Italiana-Regular.ttf"

for weight in 400 600 700; do
  curl -L -o "cormorant-$(case $weight in 400) echo regular;; 600) echo semibold;; 700) echo bold;; esac).ttf" \
    "https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-${weight}-normal.ttf"
done
curl -L -o cormorant-italic.ttf \
  "https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/latin-400-italic.ttf"

for weight in 400 500 600; do
  curl -L -o "inter-$(case $weight in 400) echo regular;; 500) echo medium;; 600) echo semibold;; esac).ttf" \
    "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-${weight}-normal.ttf"
done
curl -L -o inter-italic.ttf \
  "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-italic.ttf"
```
