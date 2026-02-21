import { toFieldRowEntryProps } from '../../src/components/fields/field-row-props.js';
import type { FieldEntry } from '../../src/hooks/use-node-fields.js';

describe('toFieldRowEntryProps', () => {
  it('preserves config metadata required by system config rows', () => {
    const entry: FieldEntry = {
      fieldDefId: 'SYS_A.EXTENDS',
      attrDefName: 'Extend from',
      fieldEntryId: '__virtual_SYS_A.EXTENDS__',
      dataType: 'plain',
      isSystemConfig: true,
      configKey: 'SYS_A.EXTENDS',
      configControl: 'tag_picker',
    };

    expect(toFieldRowEntryProps(entry)).toEqual({
      attrDefId: 'SYS_A.EXTENDS',
      attrDefName: 'Extend from',
      tupleId: '__virtual_SYS_A.EXTENDS__',
      valueNodeId: undefined,
      valueName: undefined,
      dataType: 'plain',
      trashed: undefined,
      isRequired: undefined,
      isEmpty: undefined,
      isSystemConfig: true,
      configKey: 'SYS_A.EXTENDS',
      configControl: 'tag_picker',
    });
  });
});
