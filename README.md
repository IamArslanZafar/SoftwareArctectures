# Microservices Archtecture 

# ProductOps

A small products-management system: a .NET 8 Web API (Clean Architecture + CQRS via MediatR, JWT auth, EF Core) and an Angular 18 frontend.

## Tech stack

| Layer | Technology |
|---|---|
| API | ASP.NET Core 8 Web API |
| Architecture | Clean Architecture (Domain / Application / Infrastructure / API) + CQRS via MediatR |
| Auth | ASP.NET Core Identity + JWT bearer tokens |
| Persistence | EF Core, InMemory provider (see [Known limitations](#known-limitations)) |
| Validation | FluentValidation, run automatically via a MediatR pipeline behavior |
| Backend tests | xUnit, Moq, FluentAssertions — unit (handlers/repository/token service) + integration (`WebApplicationFactory`) |
| Frontend | Angular 18 (standalone components, signals), SCSS |

## Project structure

```
ProductsWebAPI/
├── Products.API/              # Controllers, middleware, DI wiring — the only ASP.NET Core-aware project
├── Products.Application/      # CQRS commands/queries + handlers, DTOs, interfaces, validators
│   ├── Auth/                  #   Commands/Queries/Register, Login
│   ├── Products/              #   Commands/CreateProduct, Queries/GetProducts
│   ├── Common/Behaviors/      #   MediatR pipeline behaviors (validation)
│   ├── Contracts/             #   Response DTOs
│   ├── Interfaces/            #   Repository/service abstractions implemented by Infrastructure
│   └── Settings/              #   Strongly-typed config (JwtSettings)
├── Products.Domain/           # Entities (Product, ApplicationUser) — no dependencies on anything else
├── Products.Infrastructure/   # EF Core DbContext, repository implementation, JWT token service
├── Products.Tests/
│   ├── Products.UnitTests/        # Handler, repository, and token service unit tests (mocked dependencies)
│   └── Products.IntegrationTests/ # Full HTTP pipeline tests via WebApplicationFactory
└── frontend/products-ui/      # Angular app (standalone components)
```

**Dependency direction:** `API → Application, Infrastructure, Domain` · `Infrastructure → Application, Domain` · `Application → Domain` · `Domain →` (nothing). Application never references EF Core or ASP.NET Core directly — only abstractions (`IProductRepository`, `ITokenService`) that Infrastructure implements.

## How a request flows (CQRS)

Controllers do no validation or business logic — they translate an HTTP request into a Command or Query, send it through `IMediator`, and translate the result back into an HTTP response:

```csharp
[HttpPost]
public async Task<IActionResult> Create(CreateProductCommand command)
{
    var response = await _mediator.Send(command);
    return CreatedAtAction(nameof(GetAll), new { }, response);
}
```

`CreateProductCommand` *is* the request contract (it deserializes directly from the JSON body — there's no separate DTO to keep in sync). Before the handler runs, MediatR's pipeline (`ValidationBehavior`) automatically runs every registered FluentValidation validator for that request type; a failure throws `FluentValidation.ValidationException`, which `ExceptionHandlingMiddleware` turns into a `400` with a field-keyed error body. Handlers never validate manually.

- **Commands** (writes): `CreateProductCommand`, `RegisterCommand` — go through repository/`UserManager` calls that change state.
- **Queries** (reads): `GetProductsQuery`, `LoginQuery` — side-effect free. (Login doesn't write anything itself; it validates credentials and issues a token.)

## Getting started

### Backend

```bash
cd Products.API
cp appsettings.Example.json appsettings.json   # fill in a real Jwt:Key (32+ chars)
dotnet restore
dotnet run
```

API listens on the port printed in the console (see `Properties/launchSettings.json`); Swagger UI is available at `/swagger` in Development.

`appsettings.json` is gitignored on purpose — the JWT signing key is a secret. Use the `.Example` file as a template locally, or `dotnet user-secrets` for anything beyond local dev.

### Frontend

```bash
cd frontend/products-ui
npm install
npm start   # ng serve, http://localhost:4200
```

The API's CORS policy (`Program.cs`) allows `http://localhost:4200` specifically for local development.

### Tests

```bash
dotnet test
```

Runs both unit and integration test projects. Unit tests mock `IProductRepository`/`UserManager<ApplicationUser>`/`ITokenService` and exercise handlers directly (where the actual logic lives now that controllers are thin). Integration tests boot the real app in-memory via `WebApplicationFactory<Program>` and hit it over HTTP, including a full register → login → create → list → filter flow.

## API reference

| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | Anonymous | Status + uptime |
| POST | `/api/auth/register` | Anonymous | Creates the account only — returns `201` with `{ id, email }`, **no token** |
| POST | `/api/auth/login` | Anonymous | Returns `{ token, expiresAtUtc }` on success, `401` otherwise |
| POST | `/api/products` | Bearer | Create a product |
| GET | `/api/products` | Bearer | List products — `?colour=`, `?minPrice=`, `?maxPrice=`, `?page=`, `?pageSize=` |

## Design decisions

- **Register never auto-logs in.** Mixing "create an account" and "issue a session" in one response conflates two concerns; a token only ever comes from `/login`, even though it costs the client one extra round trip after registering.
- **Colour filtering is case-insensitive.** `?colour=red` matches a product stored as `"Red"`.
- **Page/pageSize are clamped, not rejected.** `GetProductsQuery.FromRequest` normalizes out-of-range paging params (page < 1 → 1, pageSize > 100 → 100) rather than returning a validation error — bad paging input isn't a client error worth failing the request over.
- **JWTs are held in memory on the frontend, not localStorage.** A successful XSS can't read a token off disk if it was never written there; the tradeoff is that a full page reload logs the user out.
- **EF Core InMemory, not a real database.** Chosen so the API runs with zero setup (no DB server, no connection string, no migrations). The tradeoff — **all data is wiped every time the API process restarts** — is deliberate for this project's scope; see below for what changing it would take.

## Known limitations

- **No persistence across restarts.** `UseInMemoryDatabase(...)` in `Program.cs` stores everything in process memory. Since the repository is abstracted behind `IProductRepository`/`AppDbContext`, switching to Postgres/SQL Server is a small, contained change: swap the EF Core provider package, change `UseInMemoryDatabase(...)` to `UseNpgsql(connectionString)` (or `UseSqlServer`), add a connection string, and run `dotnet ef migrations add InitialCreate` + `dotnet ef database update`. No controller, handler, or DTO changes required.
- **No forgot-password / social login.** The login page has UI affordances for both (a "Forgot password?" link, Google/Apple buttons) but neither is wired to a backend — there's no email-sending infrastructure or OAuth provider configured.
- **No product edit/delete.** Only create and list/filter are implemented; the products table intentionally has no per-row actions.
