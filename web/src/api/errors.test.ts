import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorFrom, errorBody, errorMessage } from './errors';

describe('errorMessage', () => {
  it('joins a validation list and reads a plain message', () => {
    expect(errorMessage(400, { message: ['Nom requis.', 'Province requise.'] })).toBe('Nom requis., Province requise.');
    expect(errorMessage(409, { message: 'Doublon probable.' })).toBe('Doublon probable.');
  });

  it('falls back on the status without a usable message', () => {
    expect(errorMessage(500, null)).toMatch(/erreur est survenue/);
    expect(errorMessage(502, 'gateway')).toMatch(/indisponible/);
    expect(errorMessage(400, { message: [] })).toMatch(/Demande invalide/);
  });

  it('never shows raw English or exception names', () => {
    expect(errorMessage(500, { message: 'Internal server error' })).toMatch(/erreur est survenue/);
    expect(errorMessage(429, { message: 'ThrottlerException: Too Many Requests' })).toMatch(/Trop de tentatives/);
    expect(errorMessage(403, { message: 'Forbidden resource' })).toMatch(/droits/);
    expect(errorMessage(400, { message: ['Nom requis.', 'Bad Request'] })).toBe('Nom requis.');
  });
});

describe('apiErrorFrom', () => {
  it('keeps the JSON body of a refusal (registry duplicates)', async () => {
    const body = { statusCode: 409, message: 'Doublon probable.', duplicates: [{ code: 'G1-0001', score: 0.9 }] };
    const err = await apiErrorFrom(new Response(JSON.stringify(body), { status: 409 }));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe('Doublon probable.');
    expect(errorBody<{ duplicates: unknown[] }>(err)?.duplicates).toHaveLength(1);
  });

  it('survives an empty or non-JSON body', async () => {
    const empty = await apiErrorFrom(new Response('', { status: 404 }));
    expect(empty.message).toBe('Élément introuvable.');
    expect(empty.body).toBeNull();
    const html = await apiErrorFrom(new Response('<html>oops</html>', { status: 500 }));
    expect(html.body).toBeNull();
  });
});

describe('errorBody', () => {
  it('is null for other errors', () => {
    expect(errorBody(new Error('x'))).toBeNull();
    expect(errorBody(new ApiError(400, 'x'))).toBeNull();
  });
});
