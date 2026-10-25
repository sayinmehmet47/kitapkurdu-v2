Welcome to your new TanStack Start app!

# Getting Started

To run this application:

```bash
npm install
npm run cf:typegen
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Development uses a **local D1 database** stored in
`.wrangler/state`; it does not provision or write to a Cloudflare account.
Do not delete that directory unless you intend to discard local data.

Set `BETTER_AUTH_SECRET` in the ignored `.env.local` to a securely generated random
value of at least 32 characters. Keep the same value across restarts so existing
session cookies remain valid. Never commit it. `BETTER_AUTH_URL` defaults to
`http://localhost:3000` in `wrangler.jsonc`; use that address when signing in.

### Learn the stack

1. Edit `src/routes/index.tsx` to see the home page update.
2. Create an account at `/demo/better-auth`.
3. Visit `/demo/drizzle`, add a todo, and refresh. Each account sees only its own todos.
4. Restart the dev server: accounts, sessions, and todos remain in local D1.

Request flow: React → TanStack Start server function/API route → Better Auth and
Drizzle → D1. `src/lib/auth.ts` reads Worker bindings; `src/lib/auth-config.ts`
constructs the auth adapter; `src/db/schema.ts` defines SQLite tables.

### Database changes and tests

```bash
npm run db:generate   # generate SQL after editing src/db/schema.ts
npm run db:migrate    # apply pending SQL to LOCAL D1 only
npm run cf:typegen    # regenerate types after changing Worker configuration
npm run typecheck
npm test             # isolated temporary D1; never uses development/production data
npm run build
```

Drizzle generates SQL; Wrangler applies it and tracks migration history. No
`DATABASE_URL`, PostgreSQL server, or Cloudflare credentials are needed locally.

# Building For Production

To build this application for production:

```bash
npm run build
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Remove `@tailwindcss/vite` and `tailwindcss` from `package.json`

## Linting & Formatting

This project uses [Biome](https://biomejs.dev/) for linting and formatting. The following scripts are available:


```bash
npm run lint
npm run format
npm run check
```


## Deploy to Cloudflare Workers

This project uses the Cloudflare Vite plugin (configured in `vite.config.ts`) and `wrangler.jsonc`:

### Public test environment

URL: https://kitapkurdu.kigx.xyz

The Custom Domain is managed by the `env.test.routes` configuration in
`wrangler.jsonc`; Cloudflare manages its DNS record and HTTPS certificate.
The root `kigx.xyz` domain is not changed. The original
`https://kitapkurdu-v2-test.sayinmehmet47.workers.dev` address remains enabled,
but use the Custom Domain for authentication: it is the configured
`BETTER_AUTH_URL`. You may need to sign in again on the new hostname.

The named `test` environment deploys Worker `kitapkurdu-v2-test`, bound to a
separate hosted D1 database with the same name. Its `BETTER_AUTH_SECRET` is stored
as a Cloudflare Worker secret and is separate from the local secret. Local accounts
are not copied; create a new account on the test site. This is a public learning
deployment, not a production-ready service. Use test data only.

After explicitly choosing to update the test deployment:

```bash
npm run db:migrate:test   # REMOTE: updates only the hosted test database
npm run deploy:test      # builds with CLOUDFLARE_ENV=test, then deploys
```

With the Vite plugin, environment selection happens at **build time**. Do not
deploy a local build with only `wrangler deploy --env test`; use `deploy:test`.
The local `npm run dev` and `npm run db:migrate` still use local D1 only.

### Future production environment

**Production is not configured.** The default D1 binding retains a local-only
placeholder ID. Before a production deployment, configure a separate named
production environment with its own database, URL, and auth secret, and explicitly
apply migrations there. Local `.env.local` secrets and `.wrangler/state` data are
not automatically deployed.

Wrangler is already a project dependency; a global installation is unnecessary.
Do not use the default `npm run deploy` with the local-only configuration. Remote
operations require explicit approval. Existing npm audit findings in development
and build tooling still need review; no breaking automatic downgrades were applied.

See https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/.


## Setting up Better Auth

Better Auth uses the Drizzle SQLite adapter with D1. Users, hashed credentials,
sessions, verification records, and rate-limit counters are persistent. D1 does
not support interactive transactions, so the auth adapter explicitly disables them.

The `/api/auth/$` route handles signup, signin, session lookup, and signout.
Server-side todo operations check the session and scope queries to the current
user. Email/password login is available for local learning; Google OAuth, email
verification, and password-reset email delivery are not configured yet.

Keep all schema migrations in the shared Drizzle/Wrangler flow above; do not run
the Better Auth migration command against the Drizzle adapter.


## Shadcn

Add components using the latest version of [Shadcn](https://ui.shadcn.com/).

```bash
pnpm dlx shadcn@latest add button
```



## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// Use in a component
function MyComponent() {
  const [time, setTime] = useState('')
  
  useEffect(() => {
    getServerTime().then(setTime)
  }, [])
  
  return <div>Server time: {time}</div>
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).


# Demo files

Files prefixed with `demo` can be safely deleted. They are there to provide a starting point for you to play around with the features you've installed.


# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).
