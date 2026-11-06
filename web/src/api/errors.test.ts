import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorFrom, errorBody, errorMessage } from './errors';

describe('errorMessage', () => {
  it('joins a validation list and reads a plain message', () => {
    expect(errorMessage(400, { message: ['Nom requis.', 'Province requise.'] })).toBe('Nom requis., Province requise.');
    expect(errorMessage(409, { message: 'Doublon probable.' })).toBe('Doublon probable.');
  });

  it('falls back on the status without a usable message', () => {
    expect(errorMessage(500, null)).toBe('Erreur serveur (500)');
    expect(errorMessage(502, 'gateway')).toBe('Erreur serveur (502)');
    expect(errorMessage(400, { message: [] })).toBe('Erreur serveur (400)');
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
    expect(empty.message).toBe('Erreur serveur (404)');
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
