/**
 * @fileoverview Token Action HUD - Shadowrun 4e
 * Compatible with Token Action HUD Core v2.x
 */

const MODULE_ID = 'token-action-hud-sr4';

const GROUPS = {
  // Top-level tabs
  activeSkills:      { id: 'active-skills',       name: 'SR4.HUD.ActiveSkills',    type: 'system' },
  knowledgeSkills:   { id: 'knowledge-skills',    name: 'SR4.HUD.KnowledgeSkills', type: 'system' },
  weapons:           { id: 'weapons',             name: 'SR4.HUD.Weapons',         type: 'system' },
  monitor:           { id: 'monitor',             name: 'SR4.HUD.Monitor',         type: 'system' },
  freeRoll:          { id: 'free-roll',           name: 'SR4.HUD.FreeRoll',        type: 'system' },

  // Active skill subgroups
  skillsCombat:      { id: 'skills-combat',       name: 'SR4.HUD.Skills.Combat',    type: 'system' },
  skillsPhysical:    { id: 'skills-physical',     name: 'SR4.HUD.Skills.Physical',  type: 'system' },
  skillsSocial:      { id: 'skills-social',       name: 'SR4.HUD.Skills.Social',    type: 'system' },
  skillsTechnical:   { id: 'skills-technical',    name: 'SR4.HUD.Skills.Technical', type: 'system' },
  skillsMatrix:      { id: 'skills-matrix',       name: 'SR4.HUD.Skills.Matrix',    type: 'system' },
  skillsMagic:       { id: 'skills-magic',        name: 'SR4.HUD.Skills.Magic',     type: 'system' },
  skillsVehicle:     { id: 'skills-vehicle',      name: 'SR4.HUD.Skills.Vehicle',   type: 'system' },
  skillsMisc:        { id: 'skills-misc',         name: 'SR4.HUD.Skills.Misc',      type: 'system' },

  // Knowledge skill subgroups
  knowledgeAcademic: { id: 'knowledge-academic',  name: 'SR4.HUD.Skills.Academic',  type: 'system' },
  knowledgeStreet:   { id: 'knowledge-street',    name: 'SR4.HUD.Skills.Street',    type: 'system' },
  knowledgeMisc:     { id: 'knowledge-misc',      name: 'SR4.HUD.Skills.Misc',      type: 'system' },

  // Subgroups
  weaponsList:       { id: 'weapons-list',        name: 'SR4.HUD.Weapons',          type: 'system' },
  monitorList:       { id: 'monitor-list',        name: 'SR4.HUD.Monitor',          type: 'system' },
  freeRollList:      { id: 'free-roll-list',      name: 'SR4.HUD.FreeRoll',         type: 'system' },
};

const ACTIVE_SKILL_CATEGORIES    = ['combat', 'physical', 'social', 'technical', 'matrix', 'magic', 'vehicle', 'misc'];
const KNOWLEDGE_SKILL_CATEGORIES = ['academic', 'street', 'misc'];

/**
 * Maps a knowledge skill's linked attribute to a display category.
 * LOGIC     → academic
 * INTUITION → street
 * other     → misc
 *
 * @param {string} attribute
 * @returns {'academic'|'street'|'misc'}
 */
function knowledgeCategory(attribute) {
  switch (attribute?.toUpperCase()) {
    case 'LOGIC':     return 'academic';
    case 'INTUITION': return 'street';
    default:          return 'misc';
  }
}

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {

  // ---------------------------------------------------------------------------
  // Roll Handler
  // ---------------------------------------------------------------------------

  class SR4RollHandler extends coreModule.api.RollHandler {
    constructor(...args) {
      super(...args);
    }

    sr4           = game?.shadowrun4e;
    dialogUtility = this.sr4.dialogUtility;

    async handleActionClick(event, encodedValue) {
      const [actionType, actionId] = encodedValue.split('|');
      const actor = this.actor;

      switch (actionType) {
        case 'skill':    await this.#rollSkill(actor, actionId);     break;
        case 'weapon':   await this.#rollWeapon(actor, actionId);    break;
        case 'monitor':  await this.#adjustMonitor(actor, actionId); break;
        case 'freeRoll': await this.#openFreeRollDialog();           break;
      }
    }

    async #rollSkill(actor, skillId) {
      const skill = actor.items.get(skillId);
      if (!skill) return;
      this.dialogUtility.handleSkillRoll(actor, skill.name);
    }

    async #rollWeapon(actor, weaponId) {
      const weapon = actor.items.get(weaponId);
      if (!weapon) return;

      const skill = actor.findByAttackSkill(weapon.system.attackSkill);
      if (!skill) {
        ui.notifications?.warn(`No attack skill found for ${weapon.name}`);
        return;
      }

      this.dialogUtility.handleSkillRoll(actor, skill.name, weapon);
    }

    async #adjustMonitor(actor, track) {
      const monitor = actor.system.conditionMonitor[track];
      if (!monitor) return;

      new Dialog({
        title: `${game.i18n.localize(`sr4.monitor.${track}`)} — ${monitor.current}/${monitor.max}`,
        content: `
          <div style="display:flex;flex-direction:column;gap:8px;padding:8px;">
            <label>${game.i18n.localize('sr4.monitor.setCurrent')}</label>
            <input id="monitor-value" type="number" min="0" max="${monitor.max}"
              value="${monitor.current}" style="width:100%;">
          </div>
        `,
        buttons: {
          set: {
            label: game.i18n.localize('sr4.monitor.set'),
            callback: async (html) => {
              const val = Math.clamp(
                parseInt(html.find('#monitor-value').val()) || 0, 0, monitor.max
              );
              await actor.update({ [`system.conditionMonitor.${track}.current`]: val });
            },
          },
          reset: {
            label: game.i18n.localize('sr4.monitor.reset'),
            callback: async () => {
              await actor.update({ [`system.conditionMonitor.${track}.current`]: 0 });
            },
          },
        },
        default: 'set',
      }).render(true);
    }

    /**
     * Delegates to DieButtonHook.showDialog() from the sr4 system.
     * DieButtonHook must be exported on game.shadowrun4e for this to work.
     */
    async #openFreeRollDialog() {
      const DieButtonHook = game?.shadowrun4e?.DieButtonHook;

      if (!DieButtonHook?.showDialog) {
        ui.notifications?.warn('[SR4-HUD] DieButtonHook.showDialog not available on game.shadowrun4e');
        return;
      }

      await DieButtonHook.showDialog();
    }
  }

  // ---------------------------------------------------------------------------
  // Action Handler
  // ---------------------------------------------------------------------------

  class SR4ActionHandler extends coreModule.api.ActionHandler {
    constructor(...args) {
      super(...args);
    }

    async buildSystemActions(groupIds) {
      const actor = this.actor;
      if (!actor) return;
      await this.#buildActiveSkills(actor);
      await this.#buildKnowledgeSkills(actor);
      await this.#buildWeapons(actor);
      await this.#buildMonitor(actor);
      await this.#buildFreeRoll();
    }

    async #buildActiveSkills(actor) {
      const skills = actor.items.filter(i => i.type === 'Skill' && i.system.type === 'active');

      for (const category of ACTIVE_SKILL_CATEGORIES) {
        const actions = skills
          .filter(s => (s.system.category ?? 'misc') === category)
          .sort((a, b) => {
            const la = a.system.label ? game.i18n.localize(a.system.label) : a.name;
            const lb = b.system.label ? game.i18n.localize(b.system.label) : b.name;
            return la.localeCompare(lb);
          })
          .map(skill => ({
            id:           skill.id,
            name:         skill.system.label ? game.i18n.localize(skill.system.label) : skill.name,
            img:          skill.img,
            encodedValue: `skill|${skill.id}`,
            tooltip:      `${skill.name} (${skill.system.attribute}) · Rating ${skill.system.rating}`,
          }));

        if (!actions.length) continue;

        this.addActions(actions, {
          id:     `skills-${category}`,
          nestId: `active-skills_skills-${category}`,
          type:   'system',
        });
      }
    }

    async #buildKnowledgeSkills(actor) {
      const skills = actor.items.filter(i => i.type === 'Skill' && i.system.type === 'knowledge');

      for (const category of KNOWLEDGE_SKILL_CATEGORIES) {
        const actions = skills
          .filter(s => knowledgeCategory(s.system.attribute) === category)
          .sort((a, b) => {
            const la = a.system.label ? game.i18n.localize(a.system.label) : a.name;
            const lb = b.system.label ? game.i18n.localize(b.system.label) : b.name;
            return la.localeCompare(lb);
          })
          .map(skill => ({
            id:           skill.id,
            name:         skill.system.label ? game.i18n.localize(skill.system.label) : skill.name,
            img:          skill.img,
            encodedValue: `skill|${skill.id}`,
            tooltip:      `${skill.name} (${skill.system.attribute}) · Rating ${skill.system.rating}`,
          }));

        if (!actions.length) continue;

        this.addActions(actions, {
          id:     `knowledge-${category}`,
          nestId: `knowledge-skills_knowledge-${category}`,
          type:   'system',
        });
      }
    }

    async #buildWeapons(actor) {
      const actions = actor.items
        .filter(i => i.type === 'Ranged Weapon' || i.type === 'Melee Weapon')
        .map(w => ({
          id:           w.id,
          name:         w.name,
          img:          w.img,
          encodedValue: `weapon|${w.id}`,
          tooltip:      `${w.name} · DMG: ${w.system.damage ?? '?'} AP: ${w.system.ap ?? '?'}`,
        }));

      this.addActions(actions, { id: 'weapons-list', nestId: 'weapons_weapons-list', type: 'system' });
    }

    async #buildMonitor(actor) {
      const cm = actor.system?.conditionMonitor;
      if (cm === undefined) return;

      const actions = [
        {
          id:           'physical',
          name:         `${game.i18n.localize('sr4.monitor.physical')}: ${cm.physical.current}/${cm.physical.max}`,
          img:          'icons/svg/regen.svg',
          encodedValue: 'monitor|physical',
        },
        {
          id:           'stun',
          name:         `${game.i18n.localize('sr4.monitor.stun')}: ${cm.stun.current}/${cm.stun.max}`,
          img:          'icons/svg/daze.svg',
          encodedValue: 'monitor|stun',
        },
      ];

      this.addActions(actions, { id: 'monitor-list', nestId: 'monitor_monitor-list', type: 'system' });
    }

    async #buildFreeRoll() {
      const actions = [
        {
          id:           'free-roll',
          name:         game.i18n.localize('SR4.HUD.FreeRoll'),
          img:          'icons/svg/d20-grey.svg',
          encodedValue: 'freeRoll|free-roll',
          tooltip:      game.i18n.localize('SR4.HUD.FreeRollTooltip'),
        },
      ];

      this.addActions(actions, { id: 'free-roll-list', nestId: 'free-roll_free-roll-list', type: 'system' });
    }
  }

  // ---------------------------------------------------------------------------
  // System Manager
  // ---------------------------------------------------------------------------

  class SR4SystemManager extends coreModule.api.SystemManager {
    getActionHandler() {
      return new SR4ActionHandler();
    }

    getRollHandler() {
      return new SR4RollHandler();
    }

    getAvailableRollHandlers() {
      return { core: 'SR4 Default' };
    }

    registerSettings(updateFunc) {}

    async registerDefaults() {
      return {
        groups: Object.values(GROUPS),
        layout: [
          {
            nestId: 'active-skills', id: 'active-skills', name: 'SR4.HUD.ActiveSkills', type: 'system',
            groups: ACTIVE_SKILL_CATEGORIES.map(cat => ({
              nestId: `active-skills_skills-${cat}`,
              id:     `skills-${cat}`,
              name:   `SR4.HUD.Skills.${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
              type:   'system',
            })),
          },
          {
            nestId: 'knowledge-skills', id: 'knowledge-skills', name: 'SR4.HUD.KnowledgeSkills', type: 'system',
            groups: KNOWLEDGE_SKILL_CATEGORIES.map(cat => ({
              nestId: `knowledge-skills_knowledge-${cat}`,
              id:     `knowledge-${cat}`,
              name:   `SR4.HUD.Skills.${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
              type:   'system',
            })),
          },
          {
            nestId: 'weapons', id: 'weapons', name: 'SR4.HUD.Weapons', type: 'system',
            groups: [{ nestId: 'weapons_weapons-list', id: 'weapons-list', name: 'SR4.HUD.Weapons', type: 'system' }],
          },
          {
            nestId: 'monitor', id: 'monitor', name: 'SR4.HUD.Monitor', type: 'system',
            groups: [{ nestId: 'monitor_monitor-list', id: 'monitor-list', name: 'SR4.HUD.Monitor', type: 'system' }],
          },
          {
            nestId: 'free-roll', id: 'free-roll', name: 'SR4.HUD.FreeRoll', type: 'system',
            groups: [{ nestId: 'free-roll_free-roll-list', id: 'free-roll-list', name: 'SR4.HUD.FreeRoll', type: 'system' }],
          },
        ],
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Register with Token Action HUD Core
  // ---------------------------------------------------------------------------

  const module = game.modules.get(MODULE_ID);
  module.api = { SystemManager: SR4SystemManager };
  console.log('[SR4-HUD] Registering module API', module);
  Hooks.call('tokenActionHudSystemReady', module);
});