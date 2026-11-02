# Scouted

Wordle for football. Next.js 16 App Router + React 19 + TS + Tailwind v4 + shadcn/ui
(`base-nova` style, neutral base, lucide icons) + `motion` for animation.

- Components live in `src/components/ui` (shadcn copy-paste). Add more with
  `npx shadcn@latest add <name>` — don't hand-write what the registry has.
- Server Components by default; `'use client'` only where there's interaction.
- Tailwind v4 is CSS-first: tokens in `src/app/globals.css` `@theme inline`.
  No `tailwind.config.*` — don't create one.
- Next 16: use `proxy.ts`, not `middleware.ts`.

## UI/frontend skills

- Building or restyling a surface → `ui-ux-pro-max`, `ui-styling`
- Tokens / palettes / type scale → `design-system`, `better-colors`, `better-typography`
- Animation → `motion-design` (or `gsap-react` if GSAP gets added)
- Review a finished screen → `better-interface` (routes to all `better-*`)
- Review a diff/branch → `interface-review`
