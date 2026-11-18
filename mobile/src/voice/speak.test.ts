import { beforeEach, describe, expect, it, vi } from 'vitest';

const engine = vi.hoisted(() => ({
  speak: vi.fn(),
  stop: vi.fn(() => Promise.resolve()),
}));
vi.mock('expo-speech', () => engine);

import { announce, isVoiceEnabled, setVoiceEnabled, speak } from './speak';

beforeEach(() => {
  setVoiceEnabled(true);
  engine.speak.mockReset();
  engine.stop.mockReset();
  engine.stop.mockImplementation(() => Promise.resolve());
});

describe('speak', () => {
  it('stops the previous utterance then speaks French', () => {
    const order: string[] = [];
    engine.stop.mockImplementation(() => {
      order.push('stop');
      return Promise.resolve();
    });
    engine.speak.mockImplementation(() => {
      order.push('speak');
    });
    speak('Combien de poules sont mortes aujourd’hui ?');
    expect(order).toEqual(['stop', 'speak']);
    expect(engine.speak.mock.calls[0][1]).toMatchObject({ language: 'fr-FR' });
  });

  it('does not throw when the engine is absent or broken', () => {
    engine.stop.mockImplementation(() => {
      throw new Error('no engine');
    });
    engine.speak.mockImplementation(() => {
      throw new Error('no french voice');
    });
    expect(() => speak('Bonjour')).not.toThrow();
  });

  it('does not throw when stop rejects', () => {
    engine.stop.mockImplementation(() => Promise.reject(new Error('boom')));
    expect(() => speak('Bonjour')).not.toThrow();
  });

  it('ignores an empty sentence', () => {
    speak('   ');
    expect(engine.speak).not.toHaveBeenCalled();
  });
});

describe('announce', () => {
  it('reads aloud by default and stays silent when the setting is off', () => {
    expect(isVoiceEnabled()).toBe(true);
    announce('Bonjour');
    expect(engine.speak).toHaveBeenCalledTimes(1);
    setVoiceEnabled(false);
    expect(isVoiceEnabled()).toBe(false);
    announce('Bonjour');
    expect(engine.speak).toHaveBeenCalledTimes(1);
  });
});
