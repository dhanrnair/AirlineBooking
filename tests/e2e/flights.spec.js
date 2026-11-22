import { expect } from '@playwright/test';
import { PASSWORD, cancel, findFlight, freeSeats, getFlight, signUp, test, uniqueEmail } from '../helpers.js';

// Wait until the app is idle so the React app is hydrated before we type into forms.
const open = async (page, url) => { await page.goto(url); await page.waitForLoadState('networkidle'); };

// The <select>'s accessible name includes its option text, so find it by its label span.
const airport = (page, label) => page.locator(`label.field:has(> span:text-is("${label}")) select`);

// Sign-up/sign-in are rate-limited (about 3 per 10s); let the window reset before UI auth tests.
const authWindow = () => new Promise((r) => setTimeout(r, 11_000));

test('search shows flights for a route and links to seat selection', async ({ page, request }) => {
  const f = await findFlight(request);
  const date = f.departsAt.slice(0, 10);
  await open(page, '/');
  await airport(page, 'From').selectOption('JFK');
  await airport(page, 'To').selectOption('LAX');
  await page.getByLabel('Date').fill(date);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText(f.flightNo).first()).toBeVisible();
  await page.getByRole('link', { name: 'Select seats' }).first().click();
  await expect(page).toHaveURL(/\/flights\//);
  await expect(page.getByRole('heading', { name: 'Choose your seats' })).toBeVisible();
});

test('search validates origin and destination', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('Choose an origin and a destination')).toBeVisible();
  await airport(page, 'From').selectOption('JFK');
  await airport(page, 'To').selectOption('JFK');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('Origin and destination must be different')).toBeVisible();
});

test('a date with no flights says so', async ({ page }) => {
  await open(page, '/?from=JFK&to=LAX&date=2000-01-01');
  await expect(page.getByText('No flights found for that route and date')).toBeVisible();
});

test('guest sees "Sign in to book" and My bookings redirects to sign in', async ({ page, request }) => {
  const f = await findFlight(request);
  await open(page, `/flights/${f.id}`);
  await expect(page.getByRole('link', { name: 'Sign in to book' })).toBeVisible();
  await open(page, '/my-bookings');
  await expect(page).toHaveURL(/\/signin/);
});

test('unknown flight shows not found', async ({ page }) => {
  await open(page, '/flights/NOPE-2000-01-01');
  await expect(page.getByText('Flight not found')).toBeVisible();
});

test('seat map: select up to 6 seats, taken seats are disabled, total updates', async ({ page, request }) => {
  const f = await findFlight(request);
  const seats = await freeSeats(request, f.id, 7);
  await open(page, `/flights/${f.id}`);
  for (const s of seats.slice(0, 6)) await page.getByRole('button', { name: new RegExp(`^Seat ${s} `) }).click();
  await expect(page.getByRole('button', { name: /^Seat .* Economy$/, pressed: true })).toHaveCount(6);
  await page.getByRole('button', { name: new RegExp(`^Seat ${seats[6]} `) }).click();
  await expect(page.getByRole('button', { pressed: true })).toHaveCount(6); // 7th is ignored
  await expect(page.locator('.summary-row.total')).toContainText(`$${(f.basePrice * 6).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  await page.getByRole('button', { name: new RegExp(`^Seat ${seats[0]} `) }).click(); // deselect
  await expect(page.getByRole('button', { pressed: true })).toHaveCount(5);
});

test('manage booking: lookup by code and email, and a wrong email is rejected', async ({ page, authed, request }) => {
  const f = await findFlight(request);
  const [seat] = await freeSeats(request, f.id);
  const b = await (await authed.post('/api/bookings', {
    data: { flightId: f.id, seats: [{ seat, passengerName: 'Lookup Tester' }], contact: { name: 'QA', email: authed.email } },
  })).json();
  try {
    await open(page, '/manage');
    await page.getByLabel('Confirmation code').fill(b.code);
    await page.getByLabel('Email').fill(uniqueEmail());
    await page.getByRole('button', { name: 'Find booking' }).click();
    await expect(page.getByText('No booking found for that confirmation code and email')).toBeVisible();

    await page.getByLabel('Email').fill(authed.email);
    await page.getByRole('button', { name: 'Find booking' }).click();
    await expect(page.getByRole('heading', { name: b.code })).toBeVisible();
    await expect(page.getByText(`Lookup Tester · seat ${seat}`)).toBeVisible();
  } finally {
    await cancel(authed, b.code);
  }
});

test('sign up, sign out and sign in again', async ({ page }) => {
  await authWindow();
  const email = uniqueEmail();
  await open(page, '/signup');
  await page.getByLabel('Name').fill('QA Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

  await open(page, '/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('sign in with a wrong password shows an error', async ({ page }) => {
  await authWindow();
  await open(page, '/signin');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Password').fill('wrong-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('full flow: pick seats, book, see confirmation, cancel, seat freed', async ({ page, request }) => {
  const f = await findFlight(request);
  const [s1, s2] = await freeSeats(request, f.id, 2);
  const email = uniqueEmail();
  await signUp(page.request, email); // same cookie jar as the page

  await open(page, `/flights/${f.id}`);
  await page.getByRole('button', { name: new RegExp(`^Seat ${s1} `) }).click();
  await page.getByRole('button', { name: new RegExp(`^Seat ${s2} `) }).click();

  // Client-side validation: passenger names are required
  await page.getByRole('button', { name: 'Confirm booking (demo)' }).click();
  await expect(page.getByText('Passenger name is required').first()).toBeVisible();

  const names = page.getByPlaceholder('Passenger full name');
  await names.nth(0).fill('Ann Tester');
  await names.nth(1).fill('Bob Tester');
  await expect(page.getByLabel('Email')).toHaveValue(email); // contact prefilled from the account
  await page.getByRole('button', { name: 'Confirm booking (demo)' }).click();

  await expect(page).toHaveURL(/\/my-bookings$/);
  await expect(page.getByRole('heading', { name: 'Booking confirmed 🎉' })).toBeVisible();
  const code = (await page.locator('.success strong').textContent()).trim();
  expect(code).toMatch(/^BK-[0-9A-F]{8}$/);
  const taken = (await getFlight(request, f.id)).takenSeats;
  expect(taken).toEqual(expect.arrayContaining([s1, s2]));
  await expect(page.getByText(`Ann Tester · seat ${s1}`)).toBeVisible();

  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await page.getByRole('button', { name: 'Yes, cancel it' }).click();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  const after = (await getFlight(request, f.id)).takenSeats;
  expect(after).not.toContain(s1);
  expect(after).not.toContain(s2);
});
