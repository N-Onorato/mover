import type { ColorRole, ElementRule, Role, SvgNode } from '../types';
import { COLOR_ROLES, ROLES, ROLE_LABELS } from '../types';

interface Props {
  selectedNode: SvgNode | null;
  rule: ElementRule | undefined;
  onChangeRole: (role: Role | null) => void;
  onChangeColorRole: (colorRole: ColorRole | null) => void;
}

export function Sidebar({ selectedNode, rule, onChangeRole, onChangeColorRole }: Props) {
  if (!selectedNode) {
    return (
      <div className="sidebar">
        <p className="hint">Click an element on the canvas to tag it.</p>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="node-tag">&lt;{selectedNode.tag}&gt;</div>
        <div className="node-id">{selectedNode.id}</div>
      </div>

      <fieldset>
        <legend>Resize behavior</legend>
        <label className="radio-row">
          <input
            type="radio"
            name="role"
            checked={!rule}
            onChange={() => onChangeRole(null)}
          />
          Fixed (default, untagged)
        </label>
        {ROLES.filter((r) => r !== 'fixed').map((r) => (
          <label className="radio-row" key={r}>
            <input
              type="radio"
              name="role"
              checked={rule?.role === r}
              onChange={() => onChangeRole(r)}
            />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Color role (optional)</legend>
        <label className="radio-row">
          <input
            type="radio"
            name="colorRole"
            checked={!rule?.colorRole}
            onChange={() => onChangeColorRole(null)}
          />
          None
        </label>
        {COLOR_ROLES.map((c) => (
          <label className="radio-row" key={c}>
            <input
              type="radio"
              name="colorRole"
              checked={rule?.colorRole === c}
              onChange={() => onChangeColorRole(c)}
            />
            {c}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
