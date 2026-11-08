import { describe, expect, it } from 'vitest';
import { listViewState } from './listState';

describe('listViewState', () => {
  it('loading while nothing is there yet', () => {
    expect(listViewState({ isLoading: true })).toBe('loading');
    expect(listViewState({ isLoading: true, data: [] })).toBe('loading');
  });
  it('error offers a retry, empty a message, never a blank state', () => {
    expect(listViewState({ isLoading: false, isError: true })).toBe('error');
    expect(listViewState({ isLoading: false, error: new Error('x') })).toBe('error');
    expect(listViewState({ isLoading: false, data: [] })).toBe('empty');
    expect(listViewState({ isLoading: false })).toBe('empty');
    expect(listViewState({ isLoading: false, data: null })).toBe('empty');
  });
  it('rows stay on screen when a refresh fails', () => {
    expect(listViewState({ isLoading: false, isError: true, data: [1] })).toBe('ready');
  });
});
