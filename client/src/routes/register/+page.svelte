<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { register } from "$lib/session.svelte";
  import { AuthApiError } from "$lib/api/auth.js";

  let email = $state("");
  let password = $state("");
  let displayName = $state("");
  let error = $state<string | null>(null);
  let submitting = $state(false);

  const intent = $derived(page.url.searchParams.get("intent"));

  async function onSubmit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    submitting = true;
    error = null;
    try {
      await register({ email, password, displayName });
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- href is resolve("/campaigns") with a static query string appended, same pattern as EmptyState.svelte's ctaHref
      await goto(intent ? `${resolve("/campaigns")}?intent=${intent}` : resolve("/campaigns"));
    } catch (err) {
      error = err instanceof AuthApiError ? err.message : "Could not register.";
    } finally {
      submitting = false;
    }
  }
</script>

<main class="page page--narrow">
  <h1 class="title">Register</h1>

  <form onsubmit={onSubmit}>
    <label class="field">
      <span class="field-label">Display name</span>
      <input type="text" bind:value={displayName} required maxlength="100" autocomplete="nickname" />
    </label>
    <label class="field">
      <span class="field-label">Email</span>
      <input type="email" bind:value={email} required maxlength="254" autocomplete="email" />
    </label>
    <label class="field">
      <span class="field-label">Password</span>
      <input type="password" bind:value={password} required minlength="8" maxlength="128" autocomplete="new-password" />
    </label>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <button type="submit" class="submit-button" disabled={submitting}>
      {submitting ? "Registering..." : "Register"}
    </button>
  </form>

  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href is resolve("/login") with a static query string appended, same pattern as EmptyState.svelte's ctaHref -->
  <a class="nav-link" href={intent ? `${resolve("/login")}?intent=${intent}` : resolve("/login")}>Already have an account? Log in</a>
</main>

<style>
  .title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field-label {
    font-family: var(--font-meta);
    font-size: var(--text-xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  input {
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-3);
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .submit-button {
    min-height: var(--tap-min);
    padding: var(--space-2) var(--space-4);
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .submit-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .submit-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .nav-link {
    color: var(--accent);
    font-family: var(--font-meta);
    font-size: var(--text-sm);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
</style>
