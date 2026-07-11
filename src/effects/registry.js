// 效果注册表：每个视觉效果（拖尾 / 粒子 / 花瓣…）是一个 { draw, resize?, dispose? } 对象。
// 注册即「接管」一帧绘制，注销即交还。EffectLayer 据此决定是否让 RAF 循环运行，
// 做到「无活跃效果时彻底静默」，不会空转清屏浪费电量。

const effects = new Set()
const listeners = new Set()

function emit() {
  for (const l of listeners) {
    try {
      l(effects.size)
    } catch (err) {
      console.error('[effectRegistry] listener error:', err)
    }
  }
}

export const effectRegistry = {
  get size() {
    return effects.size
  },
  /** 当前所有活跃效果对象的快照（数组）。供 EffectLayer 遍历绘制，避免直接暴露内部 Set。 */
  get list() {
    return [...effects]
  },
  /** 注册一个效果，返回注销函数 */
  register(effect) {
    effects.add(effect)
    emit()
    return () => {
      effects.delete(effect)
      if (effect.dispose) {
        try {
          effect.dispose()
        } catch (err) {
          console.error('[effectRegistry] dispose error:', err)
        }
      }
      emit()
    }
  },
  /** 订阅「活跃效果数量变化」，用于驱动 EffectLayer 的启停 */
  listen(cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },
}
