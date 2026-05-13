/**
 * @fileoverview Token Action HUD - Shadowrun 4e
 * Compatible with Token Action HUD Core v2.x
 */

const MODULE_ID = 'token-action-hud-sr4';

const GROUPS = {
  skills:      { id: 'skills',        name: 'SR4.HUD.Skills',  type: 'system' },
  weapons:     { id: 'weapons',       name: 'SR4.HUD.Weapons', type: 'system' },
  monitor:     { id: 'monitor',       name: 'SR4.HUD.Monitor', type: 'system' },
  skillsList:  { id: 'skills-list',   name: 'SR4.HUD.Skills',  type: 'system' },
  weaponsList: { id: 'weapons-list',  name: 'SR4.HUD.Weapons', type: 'system' },
  monitorList: { id: 'monitor-list',  name: 'SR4.HUD.Monitor', type: 'system' },
};

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {

  // ---------------------------------------------------------------------------
  // Roll Handler
  // ---------------------------------------------------------------------------

  class SR4RollHandler extends coreModule.api.RollHandler {
    constructor(...args) {
      super(...args);
    }

    async handleActionClick(event, encodedValue) {
      const [actionType, actionId] = encodedValue.split('|');
      const actor = this.actor;

      switch (actionType) {
        case 'skill':   await this.#rollSkill(actor, actionId);    break;
        case 'weapon':  await this.#rollWeapon(actor, actionId);   break;
        case 'monitor': await this.#adjustMonitor(actor, actionId); break;
      }
    }

    async #rollSkill(actor, skillId) {
      const skill = actor.items.get(skillId);
      if (!skill) return;

      const rating         = skill.system.rating > 0 ? skill.system.rating : -1;
      const attributeValue = actor.getAttribute(skill.system.attribute);
      const numDice        = Math.max(attributeValue + rating, 1);
      const skillName      = skill.system.label
        ? game.i18n.localize(skill.system.label)
        : skill.name;
      const content = await renderTemplate(
        'systems/shadowrun4e/templates/dicerolls/roll-dialog.hbs', {}
      );

      new Dialog({
        title: `${game.i18n.localize('sr4.roll.rolling')} ${skillName}`,
        content,
        buttons: {
          roll: {
            label: game.i18n.localize('sr4.roll.rollButton'),
            callback: async (html) => {
              const DiceUtility = game.shadowrun4e?.DiceUtility;
              if (!DiceUtility) return;
              const bonus   = parseInt(html.find('#bonus').val())  || 0;
              const malus   = parseInt(html.find('#malus').val())  || 0;
              const explode = html.find('#edge').prop('checked');
              const spec    = html.find('#specialization').prop('checked');
              const final   = numDice + bonus - malus + (spec ? 2 : 0);
              await DiceUtility.rollAndShow({
                numDice: final, explode,
                edgeAvailable: actor.system.sheetStats.CURRENTEDGE > 0,
                actor, skillName: skill.name,
                extended: html.find('#extended').prop('checked'),
              });
              if (explode) actor.useEdge();
            },
          },
        },
        default: 'roll',
      }).render(true);
    }

    async #rollWeapon(actor, weaponId) {
      const weapon = actor.items.get(weaponId);
      if (!weapon) return;

      const skillName = actor.getSkillNameByLabel(weapon.system);
      console.warn(skillName)
      if (!skillName) {
        ui.notifications?.warn(`No attack skill found for ${weapon.name}`);
        return;
      }
      const skill = actor.getSkill(skillName);
      if (!skill) return;

      const rating         = skill.system.rating > 0 ? skill.system.rating : -1;
      const attributeValue = actor.getAttribute(skill.system.attribute);
      const numDice        = Math.max(attributeValue + rating, 1);
      const content        = await renderTemplate(
        'systems/shadowrun4e/templates/dicerolls/roll-dialog.hbs', {}
      );

      new Dialog({
        title: `${game.i18n.localize('sr4.roll.rolling')} ${weapon.name}`,
        content,
        buttons: {
          roll: {
            label: game.i18n.localize('sr4.roll.rollButton'),
            callback: async (html) => {
              const DiceUtility = game.shadowrun4e?.DiceUtility;
              if (!DiceUtility) return;
              const bonus     = parseInt(html.find('#bonus').val()) || 0;
              const malus     = parseInt(html.find('#malus').val()) || 0;
              const explode   = html.find('#edge').prop('checked');
              const smartlink = html.find('#smartlink').prop('checked') || weapon.system.smartlink;
              const final     = numDice + bonus - malus + (smartlink ? 2 : 0);
              const successes = await DiceUtility.rollAndShow({
                numDice: final, explode,
                edgeAvailable: actor.system.sheetStats.CURRENTEDGE > 0,
                actor, skillName, extended: false,
              });
              if (explode) actor.useEdge();
              if (game.user?.targets?.size > 0) {
                for (const target of game.user.targets) {
                  game.socket?.emit('system.shadowrun4e', {
                    action: 'triggerDefense',
                    payload: {
                      defenderId: target.actor?.id,
                      attackerId: actor.id,
                      successes,
                      weapon,
                    },
                  });
                }
              }
            },
          },
        },
        default: 'roll',
      }).render(true);
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
      await this.#buildSkills(actor);
      await this.#buildWeapons(actor);
      await this.#buildMonitor(actor);
    }

    async #buildSkills(actor) {
      const actions = actor.items
        .filter(i => i.type === 'Skill')
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

      this.addActions(actions, { id: 'skills-list', nestId: 'skills_skills-list', type: 'system' });
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
            nestId: 'skills',  id: 'skills',  name: 'SR4.HUD.Skills',  type: 'system',
            groups: [{ nestId: 'skills_skills-list',   id: 'skills-list',   name: 'SR4.HUD.Skills',  type: 'system' }],
          },
          {
            nestId: 'weapons', id: 'weapons', name: 'SR4.HUD.Weapons', type: 'system',
            groups: [{ nestId: 'weapons_weapons-list', id: 'weapons-list',  name: 'SR4.HUD.Weapons', type: 'system' }],
          },
          {
            nestId: 'monitor', id: 'monitor', name: 'SR4.HUD.Monitor', type: 'system',
            groups: [{ nestId: 'monitor_monitor-list', id: 'monitor-list',  name: 'SR4.HUD.Monitor', type: 'system' }],
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
  console.warn('[SR4-HUD] Registering module API', module);
  Hooks.call('tokenActionHudSystemReady', module);
});