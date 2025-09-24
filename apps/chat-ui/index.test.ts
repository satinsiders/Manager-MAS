import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import handler from './index';
import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';

describe('chat-ui handler', () => {
  it('serves HTML page', async () => {
    const req = { 
      method: 'GET', 
      url: '/',
      query: {},
      cookies: {},
    } as unknown as VercelRequest;

    let content = '';
    let status = 0;
    const headers = new Map<string, string>();

    const res = {
      setHeader: (name: string, value: string) => {
        headers.set(name, value);
      },
      end: (data: string) => {
        content = data;
      },
      set statusCode(code: number) {
        status = code;
      }
    } as unknown as VercelResponse;

    // Call handler
    await handler(req, res);

    // Verify response
    assert.equal(status, 200);
    assert.equal(headers.get('Content-Type'), 'text/html; charset=utf-8');
    assert(content.includes('<!DOCTYPE html>'));
    assert(content.includes('Manager MAS'));
  });

  it('returns 405 for non-GET requests', async () => {
    const req = { 
      method: 'POST', 
      url: '/',
      query: {},
      cookies: {},
    } as unknown as VercelRequest;

    let content = '';
    let status = 0;
    const headers = new Map<string, string>();

    const res = {
      setHeader: (name: string, value: string) => {
        headers.set(name, value);
      },
      end: (data: string) => {
        content = data;
      },
      set statusCode(code: number) {
        status = code;
      }
    } as unknown as VercelResponse;

    // Call handler
    await handler(req, res);

    // Verify response
    assert.equal(status, 405);
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert(content.includes('method_not_allowed'));
  });

  it('serves static files', async () => {
    const req = { 
      method: 'GET', 
      url: '/static/styles.css',
      query: {},
      cookies: {},
    } as unknown as VercelRequest;

    let content = '';
    let status = 0;
    const headers = new Map<string, string>();

    const res = {
      setHeader: (name: string, value: string) => {
        headers.set(name, value);
      },
      end: (data: string) => {
        content = data;
      },
      set statusCode(code: number) {
        status = code;
      }
    } as unknown as VercelResponse;

    // Call handler
    await handler(req, res);

    // Verify response
    assert.equal(status, 200);
    assert.equal(headers.get('Content-Type'), 'text/css');
    assert(content.includes(':root'));
  });
});