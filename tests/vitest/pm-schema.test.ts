import { pmSchema } from '../../src/components/editor/pm-schema.js';

describe('pm-schema', () => {
  it('defines single-paragraph doc with inlineReference atom node', () => {
    const doc = pmSchema.node('doc', null, [
      pmSchema.node('paragraph', null, [
        pmSchema.text('Hello '),
        pmSchema.nodes.inlineReference.create({
          targetNodeId: 'task_1',
          displayName: 'Task 1',
        }),
      ]),
    ]);

    expect(doc.childCount).toBe(1);
    expect(doc.firstChild?.type.name).toBe('paragraph');
    expect(pmSchema.nodes.inlineReference.spec.atom).toBe(true);
    expect(pmSchema.nodes.inlineReference.spec.inline).toBe(true);
  });

  it('registers all expected marks and link is non-inclusive', () => {
    expect(pmSchema.marks.bold).toBeDefined();
    expect(pmSchema.marks.italic).toBeDefined();
    expect(pmSchema.marks.strike).toBeDefined();
    expect(pmSchema.marks.code).toBeDefined();
    expect(pmSchema.marks.highlight).toBeDefined();
    expect(pmSchema.marks.headingMark).toBeDefined();
    expect(pmSchema.marks.link).toBeDefined();
    expect(pmSchema.marks.link.spec.inclusive).toBe(false);
  });
});

