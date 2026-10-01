# CRITICAL DEFENSIVE CODING DIRECTIVES

You are an automated coding agent. Every code modification you introduce must strictly defend against statistical AI code generation anomalies, runtime regressions, and process crashes. You must apply the following structural rules across every file you create or edit.

---

## 1. ZERO-HALLUCINATION API CONTRACT
- **Verify Signatures Before Calling:** Never invent convenience methods, flags, or configuration options. If you are unsure of a function's signature, inspect its definition in `node_modules` or local type declarations first.
- **Never Guess Standard Library APIs:** Verify the exact Node.js runtime version from `package.json` engines before calling built-in modules (`crypto`, `fs`, `stream`, `http`).
- **No Hallucinated Packages:** Do not import packages that are not explicitly present in `package.json`. If a new dependency is required, stop and request user confirmation.

---

## 2. DEFENSIVE NULL & BOUNDARY GUARDING
- **No "Happy-Path" Traversal:** Never access nested properties directly without optional chaining (`?.`) or explicit guard clauses.
  - *Forbidden:* `const token = response.data.auth.token;`
  - *Required:* `const token = response?.data?.auth?.token;` (or an explicit check throwing a descriptive validation error).
- **Array & Collection Bounds:** Always verify array length before accessing indexed elements (e.g., `arr[0]`). Never assume query results, regex matches, or split operations return non-empty lists.
- **Strict Inversion Auditing:** Double-check every guard clause and conditional exit. Confirm that `if (!isValid)` and `if (isValid)` branch to the intended outcomes and do not invert logic.
- **Loop & Recursion Termination:** Every `while` loop and recursive function must have a mathematically reachable, verified base case with a strict fallback iteration limit to avoid 100% CPU lockups.

---

## 3. ASYNC FLOW & CONCURRENCY HYGIENE
- **No Floating Promises:** Every Promise must either be `await`ed or explicitly handled with `.catch()`. Floating promises that cause uncaught rejections will terminate the Node.js process.
- **No Async Leaks in Iterations:** Never use `Array.prototype.forEach` or `map` with an async callback if sequential or controlled parallel execution is expected. Use `for...of` or `Promise.allSettled()` instead of uncontrolled `Promise.all()`.
- **Protect the Event Loop:** Never execute synchronous CPU-intensive tasks (e.g., `crypto.pbkdf2Sync`, large JSON parses, synchronous compression) on the main event thread in web servers or API routes. Use asynchronous equivalents or worker streams.

---

## 4. CROSS-FILE CONTRACT CONSISTENCY
- **Atomic Interface Synchronization:** When changing a function signature, export, or return type in file `A`, you must identify and update every caller in files `B`, `C`, and tests in the exact same task.
- **Preserve Return Types:** Do not silently change a function's return shape (e.g., switching from returning `{ error: string }` to returning `null` or throwing) without refactoring all consuming call sites.
- **Naming Parity:** Ensure casing conventions (camelCase vs. snake_case) match across API gateways, database mappings, and frontend adapters.

---

## 5. RESOURCE MANAGEMENT & MEMORY PRESERVATION
- **Streams Over Buffers:** Never use `fs.readFileSync` or buffer arbitrary-length payloads into memory for file uploads, downloads, or network responses. Use streams (`fs.createReadStream`, pipeline).
- **Bounded Caches Only:** Never store state or cache entries in unbounded global arrays, Sets, or Maps. Any cache must implement a strict capacity cap or TTL-based eviction.
- **Dangling Event Cleanup:** Whenever an event listener (`emitter.on()`) is registered, you must provide corresponding cleanup logic (`emitter.removeListener()` or `AbortSignal`).

---

## 6. MODERNITY & DEPRECATION GUARD
- **Inspect `package.json` First:** Always check the dependencies and versions declared in `package.json` before writing code to match current syntax, rather than relying on outdated pre-trained examples.
- **No Deprecated Patterns:** Avoid legacy Node.js constructs (e.g., `new Buffer()`, `crypto.createCipher` without IV, `url.parse()`). Use current standards (`Buffer.from()`, `crypto.createCipheriv`, `new URL()`).

---

## 7. MANDATORY PRE-COMPLETION GATES
Before signaling that your task is complete, run the following verification steps:
1. **Type & Syntax Check:** Run `npm run typecheck` or `node --check <file>` to catch syntax and missing signature errors.
2. **Targeted Test Execution:** Run the test suite covering the edited module: `npm test -- <path_to_test>`.
3. **Diff Audit:** Review `git diff` to ensure no accidental indentation shifts, unwanted file changes, or leftover `console.log` statements remain.
