/**
 * @fileoverview Token Action HUD - Shadowrun 4e
 * Compatible with Token Action HUD Core v2.x
 */

const MODULE_ID = 'token-action-hud-sr4';

const ACTIVE_SKILL_CATEGORIES    = ['combat', 'physical', 'social', 'technical', 'matrix', 'magic', 'vehicle', 'misc'];
const KNOWLEDGE_SKILL_CATEGORIES = ['academic', 'street', 'misc'];

function knowledgeCategory(attribute) {
  switch (attribute?.toUpperCase()) {
    case 'LOGIC':     return 'academic';
    case 'INTUITION': return 'street';
    default:          return 'misc';
  }
}

// ---------------------------------------------------------------------------
// Roll Handler
// ---------------------------------------------------------------------------

function createRollHandler(coreModule) {
  return class SR4RollHandler extends coreModule.api.RollHandler {
    #dialog = game.shadowrun4e.dialogUtility;

    async handleActionClick(event, encodedValue) {
      const [type, id] = encodedValue.split('|');
      const actor = this.actor;

      switch (type) {
        case 'skill':    return this.#rollSkill(actor, id);
        case 'weapon':   return this.#rollWeapon(actor, id);
        case 'monitor':  return this.#adjustMonitor(actor, id);
        case 'action':   return this.#rollAction(actor, id);
        case 'freeRoll': return this.#dialog.handleFreeRoll();
      }
    }

    async #rollSkill(actor, skillId) {
      const skill = actor.items.get(skillId);
      if (skill) this.#dialog.handleSkillRoll(actor, skill.name);
    }

    async #rollWeapon(actor, weaponId) {
      const weapon = actor.items.get(weaponId);
      if (!weapon) return;
      const skill = actor.findByAttackSkill(weapon.system.attackSkill);
      if (skill) {
        this.#dialog.handleSkillRoll(actor, skill.name, weapon);
      } else {
        ui.notifications?.warn(`No attack skill found for ${weapon.name}`);
      }
    }

    async #adjustMonitor(actor, track) {
      const monitor = actor.system.conditionMonitor[track];
      if (!monitor) return;
      new Dialog({
        title:   `${loc(`sr4.monitor.${track}`)} — ${monitor.current}/${monitor.max}`,
        content: `
          <div style="display:flex;flex-direction:column;gap:8px;padding:8px;">
            <label>${loc('sr4.monitor.setCurrent')}</label>
            <input id="monitor-value" type="number" min="0" max="${monitor.max}" value="${monitor.current}" style="width:100%;">
          </div>
        `,
        buttons: {
          set: {
            label: loc('sr4.monitor.set'),
            callback: async (html) => {
              const val = Math.clamp(parseInt(html.find('#monitor-value').val()) || 0, 0, monitor.max);
              await actor.update({ [`system.conditionMonitor.${track}.current`]: val });
            },
          },
          reset: {
            label:    loc('sr4.monitor.reset'),
            callback: async () => actor.update({ [`system.conditionMonitor.${track}.current`]: 0 }),
          },
        },
        default: 'set',
      }).render(true);
    }

    async #rollAction(actor, id) {
      const action = actor.items.get(id);
      if(action) {}
      const numDice = action.system.rating1 ?? 0 + action.system.rating2 ?? 0
      this.#dialog.openActionDialog(actor, action.name, numDice)
    }
  };
}

// ---------------------------------------------------------------------------
// Action Handler
// ---------------------------------------------------------------------------

function createActionHandler(coreModule) {
  return class SR4ActionHandler extends coreModule.api.ActionHandler {

    async buildSystemActions(_groupIds) {
      const actor = this.actor;
      if (!actor) return;
      this.#buildSkills(actor, 'active',    ACTIVE_SKILL_CATEGORIES,    'active-skills',    (s) => s.system.category ?? 'misc');
      this.#buildSkills(actor, 'knowledge', KNOWLEDGE_SKILL_CATEGORIES, 'knowledge-skills', (s) => knowledgeCategory(s.system.attribute));
      this.#buildWeapons(actor);
      this.#buildMonitor(actor);
      this.#buildActions(actor);
      this.#buildFreeRoll();

    }

    #buildSkills(actor, type, categories, parentId, categorize) {
      const skills = actor.items.filter(i => i.type === 'Skill' && i.system.type === type);
      const prefix  = type === 'active' ? 'skills' : 'knowledge';

      for (const category of categories) {
        const actions = skills
          .filter(s => categorize(s) === category)
          .sort((a, b) => this.#skillName(a).localeCompare(this.#skillName(b)))
          .map(skill => ({
            id:           skill.id,
            name:         this.#skillName(skill),
            img:          skill.img,
            encodedValue: `skill|${skill.id}`,
            tooltip:      `${skill.name} (${skill.system.attribute}) · Rating ${skill.system.rating}`,
          }));

        if (!actions.length) continue;

        this.addActions(actions, {
          id:     `${prefix}-${category}`,
          nestId: `${parentId}_${prefix}-${category}`,
          type:   'system',
        });
      }
    }

    #skillName(skill) {
      return skill.system.label ? loc(skill.system.label) : skill.name;
    }

    #buildWeapons(actor) {
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

    #buildMonitor(actor) {
      const cm = actor.system?.conditionMonitor;
      if (!cm) return;
      const actions = ['physical', 'stun'].map(track => ({
        id:           track,
        name:         `${loc(`sr4.monitor.${track}`)}: ${cm[track].current}/${cm[track].max}`,
        img:          track === 'physical' ? 'icons/svg/regen.svg' : 'icons/svg/daze.svg',
        encodedValue: `monitor|${track}`,
      }));
      this.addActions(actions, { id: 'monitor-list', nestId: 'monitor_monitor-list', type: 'system' });
    }

    #buildActions(actor) {
      console.warn('OI!!')
      const actions = actor.items
        .filter(i => i.type === 'Action')
        .map(a => ({
          id: a.id,
          name: a.name,
          img: a.img,
          encodedValue: `action|${a.id}`,
          tooltip: `${a.name} · ${a.system.actionType ?? ''}`,
        }));
      console.warn(actions, 'ACTIONS')

      if (!actions.length) return;

      this.addActions(actions, {
        id: 'actions-list',
        nestId: 'actions_actions-list',
        type: 'system',
      });
    }

    #buildFreeRoll() {
      this.addActions([{
        id:           'free-roll',
        name:         loc('sr4.hud.freeRoll'),
        img:          'icons/svg/d20-grey.svg',
        encodedValue: 'freeRoll|free-roll',
        tooltip:      loc('sr4.hud.freeRollTooltip'),
      }], { id: 'free-roll-list', nestId: 'free-roll_free-roll-list', type: 'system' });
    }
  };
}

// ---------------------------------------------------------------------------
// System Manager
// ---------------------------------------------------------------------------

function createSystemManager(coreModule) {
  return class SR4SystemManager extends coreModule.api.SystemManager {
    getActionHandler()          { return new (createActionHandler(coreModule))(); }
    getRollHandler()            { return new (createRollHandler(coreModule))(); }
    getAvailableRollHandlers()  { return { core: 'SR4 Default' }; }
    registerSettings()          {}

    async registerDefaults() {
      return {
        groups: [
          { id: 'active-skills',      name: loc('sr4.hud.activeSkills'),    type: 'system' },
          { id: 'knowledge-skills',   name: loc('sr4.hud.knowledgeSkills'), type: 'system' },
          { id: 'weapons',            name: loc('sr4.hud.weapons'),         type: 'system' },
          { id: 'monitor',            name: loc('sr4.hud.monitor.tab'),     type: 'system' },
          { id: 'free-roll',          name: loc('sr4.hud.freeRoll'),        type: 'system' },
          { id: 'actions', name: loc('sr4.hud.actions'), type: 'system' },
          { id: 'actions-list', name: loc('sr4.hud.actions'), type: 'system' },

          ...ACTIVE_SKILL_CATEGORIES.map(cat =>
            ({ id: `skills-${cat}`,      name: loc(`sr4.hud.skills.${cat}`), type: 'system' })
          ),
          ...KNOWLEDGE_SKILL_CATEGORIES.map(cat =>
            ({ id: `knowledge-${cat}`,   name: loc(`sr4.hud.skills.${cat}`), type: 'system' })
          ),
          { id: 'weapons-list',       name: loc('sr4.hud.weapons'),         type: 'system' },
          { id: 'monitor-list',       name: loc('sr4.hud.monitor.tab'),         type: 'system' },
          { id: 'free-roll-list',     name: loc('sr4.hud.freeRoll'),        type: 'system' },
        ],
        layout: [
          {
            nestId: 'active-skills', id: 'active-skills',
            name: loc('sr4.hud.activeSkills'), type: 'system',
            groups: ACTIVE_SKILL_CATEGORIES.map(cat => ({
              nestId: `active-skills_skills-${cat}`,
              id:     `skills-${cat}`,
              name:   loc(`sr4.hud.skills.${cat}`),
              type:   'system',
            })),
          },
          {
            nestId: 'knowledge-skills', id: 'knowledge-skills',
            name: loc('sr4.hud.knowledgeSkills'), type: 'system',
            groups: KNOWLEDGE_SKILL_CATEGORIES.map(cat => ({
              nestId: `knowledge-skills_knowledge-${cat}`,
              id:     `knowledge-${cat}`,
              name:   loc(`sr4.hud.skills.${cat}`),
              type:   'system',
            })),
          },
          {
            nestId: 'weapons', id: 'weapons',
            name: loc('sr4.hud.weapons'), type: 'system',
            groups: [{ nestId: 'weapons_weapons-list', id: 'weapons-list', name: loc('sr4.hud.weapons'), type: 'system' }],
          },
          {
            nestId: 'monitor', id: 'monitor',
            name: loc('sr4.hud.monitor'), type: 'system',
            groups: [{ nestId: 'monitor_monitor-list', id: 'monitor-list', name: loc('sr4.hud.monitor'), type: 'system' }],
          },
          {
            nestId: 'free-roll', id: 'free-roll',
            name: loc('sr4.hud.freeRoll'), type: 'system',
            groups: [{ nestId: 'free-roll_free-roll-list', id: 'free-roll-list', name: loc('sr4.hud.freeRoll'), type: 'system' }],
          },
          {
            nestId: 'actions',
            id: 'actions',
            name: loc('sr4.hud.actions'),
            type: 'system',
            groups: [
              {
                nestId: 'actions_actions-list',
                id: 'actions-list',
                name: loc('sr4.hud.actions'),
                type: 'system',
              },
            ],
          },
        ],
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const loc = (key) => game.i18n.localize(key);

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
  const module = game.modules.get(MODULE_ID);
  module.api = { SystemManager: createSystemManager(coreModule) };
  console.log('[SR4-HUD] Registering module API', module);
  Hooks.call('tokenActionHudSystemReady', module);
});