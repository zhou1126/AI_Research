import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import NotebookLab from '../app/notebook/page';
import { EXAMPLES } from '../lib/notebook/data';
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === 'string' ? child : label(child)).join('');
const button = (renderer: ReactTestRenderer, name: string) => renderer.root.findAllByType('button').find(node => label(node) === name)!;
test('notebook is runnable: demo input stays private to its call and comparison displays real returned predictions', async () => {
  const original = globalThis.fetch; let renderer!: ReactTestRenderer; const requests: Record<string, string>[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/api/config') return Response.json({ jev: { configured: true, model: 'jev-test' }, openai: { configured: true, model: 'llm-test' } });
    const body = JSON.parse(init!.body as string); requests.push(body);
    return Response.json({ id: body.id || 'demo', engine: body.engine, model: 'returned-model', prediction: EXAMPLES.find(e => e.id === body.id)?.expected || 'positive', response: { example: true } });
  };
  try {
    await act(async () => { renderer = create(React.createElement(NotebookLab)); });
    assert.ok(renderer.root.findAllByType('a').some(a => a.props.href === '/notebook' && a.props['aria-current'] === 'page'));
    assert.match(label(renderer.root), /No preset scores/);
    await act(async () => { await button(renderer, 'Run basic Choice').props.onClick(); });
    assert.equal(requests[0].mode, 'basic'); assert.equal(requests[0].engine, 'jev');
    assert.match(label(renderer.root), /Choice: positive/);
    await act(async () => { await button(renderer, 'Run JEV example').props.onClick(); });
    assert.equal(requests[1].mode, 'demo'); assert.ok(requests[1].text.length > 0);
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Benchmark question count' }).props.onChange({ target: { value: '5' } }); });
    await act(async () => { renderer.root.findAllByProps({ type: 'checkbox' })[2].props.onChange({ target: { checked: false } }); });
    await act(async () => { await button(renderer, 'Run comparison').props.onClick(); });
    assert.equal(requests.length, 12);
    assert.ok(requests.slice(2).every(body => Object.keys(body).sort().join(',') === 'engine,id,mode'));
    assert.match(label(renderer.root), /COMPLETE · 5 questions per model · 10\/10 attempts recorded/);
    assert.match(label(renderer.root), /100.0%/);
    assert.equal(button(renderer, 'Resume comparison').props.disabled, true);
    assert.equal(button(renderer, 'Export results').props.disabled, false);
  } finally { await act(async () => renderer?.unmount()); globalThis.fetch = original; }
});

test('notebook runs each primitive separately and batches benchmark JEV questions in one call', async () => {
  const original = globalThis.fetch; let renderer!: ReactTestRenderer; const requests: { mode: string; primitive?: string; ids?: string[] }[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/api/config') return Response.json({ jev: { configured: true, model: 'jev-test' } });
    const body = JSON.parse(init!.body as string); requests.push(body);
    if (body.mode === 'primitive') {
      const key = { choice: 'sentiment', score: 'financial_outlook', noul: 'reports_growth' }[body.primitive as 'choice' | 'score' | 'noul'];
      return Response.json({ engine: 'jev', model: 'jev-test', response: { answers: { [key]: body.primitive === 'choice' ? { choice: 'positive' } : body.primitive === 'score' ? { score: 2 } : { noul: 1 } } } });
    }
    if (body.mode === 'batch') return Response.json({ engine: 'jev', model: 'jev-test', rows: body.ids.map((id: string) => ({ id, engine: 'jev', model: 'jev-test', prediction: EXAMPLES.find(e => e.id === id)!.expected, elapsedMs: 2 })), request: { questions: body.ids }, response: { answers: {} } });
    throw new Error('Unexpected request');
  };
  try {
    await act(async () => { renderer = create(React.createElement(NotebookLab)); });
    for (const primitive of ['Choice', 'Score', 'Noul']) await act(async () => { await button(renderer, `Run ${primitive}`).props.onClick(); });
    assert.deepEqual(requests.map(request => request.primitive), ['choice', 'score', 'noul']);
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Benchmark question count' }).props.onChange({ target: { value: '5' } }); });
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'JEV request mode' }).props.onChange({ target: { value: 'batch' } }); });
    await act(async () => { renderer.root.findAllByProps({ type: 'checkbox' })[1].props.onChange({ target: { checked: false } }); });
    await act(async () => { renderer.root.findAllByProps({ type: 'checkbox' })[2].props.onChange({ target: { checked: false } }); });
    await act(async () => { await button(renderer, 'Run comparison').props.onClick(); });
    assert.equal(requests.length, 4, JSON.stringify(requests));
    assert.equal(requests[3].mode, 'batch'); assert.equal(requests[3].ids?.length, 5);
    assert.match(label(renderer.root), /COMPLETE · 5 questions per model · 5\/5 attempts recorded/);
    assert.match(label(renderer.root), /JEV batch · 5 questions · one call/);
  } finally { await act(async () => renderer?.unmount()); globalThis.fetch = original; }
});
