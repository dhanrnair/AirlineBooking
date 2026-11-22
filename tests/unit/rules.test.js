import { describe, expect, it } from 'vitest';
import {
  BUSINESS_ROWS, MAX_PASSENGERS, SEAT_CAPACITY, formatPrice, isValidSeat, roundMoney,
  seatClass, seatPrice, validateBooking, validateContact,
} from '../../shared/rules.js';

describe('seats', () => {
  it('capacity is 20 rows x 6 seats', () => expect(SEAT_CAPACITY).toBe(120));
  it.each(['1A', '9F', '20F', '10C'])('%s is valid', (s) => expect(isValidSeat(s)).toBe(true));
  it.each(['0A', '21A', '1G', 'A1', '', '1a', '100A', undefined, null])('%j is invalid', (s) => {
    expect(isValidSeat(s)).toBe(false);
  });
  it('first BUSINESS_ROWS rows are Business', () => {
    expect(seatClass(`${BUSINESS_ROWS}F`)).toBe('Business');
    expect(seatClass(`${BUSINESS_ROWS + 1}A`)).toBe('Economy');
    expect(seatClass('1A')).toBe('Business');
    expect(seatClass('20F')).toBe('Economy');
  });
});

describe('seatPrice', () => {
  it('Economy pays the base fare, Business 2.5x', () => {
    expect(seatPrice(289, '10A')).toBe(289);
    expect(seatPrice(289, '1A')).toBe(722.5);
  });
  it('rounds to cents', () => expect(seatPrice(99.99, '2B')).toBe(249.98));
});

describe('money', () => {
  it('rounds to cents', () => {
    expect(roundMoney(2.345)).toBe(2.35);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
  it('formats USD', () => {
    expect(formatPrice(722.5)).toBe('$722.50');
    expect(formatPrice(0)).toBe('$0.00');
  });
});

describe('validateContact', () => {
  it('accepts valid input', () => expect(validateContact({ name: 'A', email: 'a@b.co' })).toEqual({}));
  it('flags missing name and bad email', () => {
    expect(validateContact({})).toEqual({ name: 'Name is required', email: 'Enter a valid email' });
    expect(validateContact({ name: 'A', email: 'a@b' })).toHaveProperty('email');
  });
});

describe('validateBooking', () => {
  const contact = { name: 'A', email: 'a@b.co' };
  const ok = { contact, seats: [{ seat: '10A', passengerName: 'Ann' }] };
  it('accepts a valid booking', () => expect(validateBooking(ok)).toEqual({}));
  it('requires at least one seat', () => {
    expect(validateBooking({ contact, seats: [] })).toHaveProperty('seats');
    expect(validateBooking({ contact })).toHaveProperty('seats');
  });
  it('limits passengers', () => {
    const seats = Array.from({ length: MAX_PASSENGERS + 1 }, (_, i) => ({ seat: `${10 + i}A`, passengerName: 'P' }));
    expect(validateBooking({ contact, seats }).seats).toMatch(/at most 6/);
  });
  it('rejects invalid and duplicate seats', () => {
    expect(validateBooking({ contact, seats: [{ seat: '99Z', passengerName: 'P' }] }).seats).toMatch(/Invalid seat/);
    const dup = [{ seat: '5A', passengerName: 'P' }, { seat: '5A', passengerName: 'Q' }];
    expect(validateBooking({ contact, seats: dup }).seats).toMatch(/twice/);
  });
  it('requires a name per passenger', () => {
    const e = validateBooking({ contact, seats: [{ seat: '5A', passengerName: 'P' }, { seat: '5B', passengerName: ' ' }] });
    expect(e).toEqual({ passenger1: 'Passenger name is required' });
  });
  it('reports contact errors too', () => {
    expect(validateBooking({ contact: {}, seats: ok.seats })).toHaveProperty('email');
  });
});
