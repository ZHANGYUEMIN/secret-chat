import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  baseAlpha: number
  /** 该粒子稳态时的速度大小（每个粒子不同，避免视觉同质化） */
  baseSpeed: number
}

interface Ripple {
  x: number
  y: number
  bornAt: number
}

interface Props {
  /** 桌面端粒子密度（每 N 平方像素 1 个粒子，越大越稀疏） */
  density?: number
  /** 桌面端邻近连线最大距离 */
  linkDistance?: number
  /** 桌面端鼠标交互半径 */
  mouseRadius?: number
  className?: string
}

const RIPPLE_LIFETIME = 900 // ms

/**
 * 极简粒子背景：响应式
 * - 桌面端：80~110 粒子 + 鼠标排斥
 * - 移动端：30~45 粒子 + 触摸涟漪扩散 + 触摸吸引
 */
export function ParticleField({
  density = 22000,
  linkDistance = 140,
  mouseRadius = 140,
  className = '',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let cssWidth = 1
    let cssHeight = 1
    let particles: Particle[] = []
    let isMobile = false
    let actualDensity = density
    let actualLinkDistance = linkDistance
    let actualMouseRadius = mouseRadius
    let actualMaxParticles = 110
    let actualMinR = 0.8
    let actualMaxR = 2.2

    /** 根据视口动态计算各项参数 */
    const resolveParams = () => {
      const w = window.innerWidth
      isMobile = w < 768 || matchMedia('(pointer: coarse)').matches
      if (isMobile) {
        // 手机：粒子稀疏 + 连线短 + 触摸圆小
        actualDensity = Math.max(28000, density * 1.5)
        actualLinkDistance = Math.min(linkDistance, 95)
        actualMouseRadius = Math.min(mouseRadius, 100)
        actualMaxParticles = w < 380 ? 32 : 45
        actualMinR = 1.0
        actualMaxR = 2.4
      } else {
        actualDensity = density
        actualLinkDistance = linkDistance
        actualMouseRadius = mouseRadius
        actualMaxParticles = 110
        actualMinR = 0.8
        actualMaxR = 2.2
      }
    }

    /** DPR：移动端限制更严，防止 Retina 屏渲染量爆炸 */
    const getDpr = () => {
      const dpr = window.devicePixelRatio || 1
      return isMobile ? Math.min(dpr, 1.75) : Math.min(dpr, 2)
    }

    const makeParticle = (): Particle => {
      // 每个粒子有自己的稳态速度，让运动有层次感（有的快有的慢）
      const minS = isMobile ? 0.1 : 0.13
      const maxS = isMobile ? 0.18 : 0.24
      const baseSpeed = minS + Math.random() * (maxS - minS)
      const angle = Math.random() * Math.PI * 2
      return {
        x: Math.random() * cssWidth,
        y: Math.random() * cssHeight,
        vx: Math.cos(angle) * baseSpeed,
        vy: Math.sin(angle) * baseSpeed,
        r: Math.random() * (actualMaxR - actualMinR) + actualMinR,
        baseAlpha: Math.random() * 0.4 + 0.45,
        baseSpeed,
      }
    }

    const resize = () => {
      resolveParams()
      const rect = canvas.getBoundingClientRect()
      cssWidth = rect.width || window.innerWidth
      cssHeight = rect.height || window.innerHeight
      const dpr = getDpr()
      canvas.width = Math.floor(cssWidth * dpr)
      canvas.height = Math.floor(cssHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const target = Math.min(
        actualMaxParticles,
        Math.max(20, Math.floor((cssWidth * cssHeight) / actualDensity)),
      )
      if (particles.length > target) {
        particles.length = target
      } else {
        for (let i = particles.length; i < target; i++) {
          particles.push(makeParticle())
        }
      }
    }

    let pointerX = -9999
    let pointerY = -9999
    let pointerActive = false
    /** 触摸点产生的涟漪（最多保留几个） */
    const ripples: Ripple[] = []

    const setPointer = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      pointerX = clientX - rect.left
      pointerY = clientY - rect.top
      pointerActive = true
    }
    const clearPointer = () => {
      pointerX = -9999
      pointerY = -9999
      pointerActive = false
    }

    const onMouseMove = (e: MouseEvent) => setPointer(e.clientX, e.clientY)
    const onMouseLeave = () => clearPointer()

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      setPointer(t.clientX, t.clientY)
      const rect = canvas.getBoundingClientRect()
      ripples.push({
        x: t.clientX - rect.left,
        y: t.clientY - rect.top,
        bornAt: performance.now(),
      })
      if (ripples.length > 5) ripples.shift()
    }
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      setPointer(t.clientX, t.clientY)
    }
    const onTouchEnd = () => {
      // 抬手后稍微保留一段交互的视觉残留，再清除
      setTimeout(() => {
        if (!pointerActive) return
        clearPointer()
      }, 250)
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', clearPointer)

    let isVisible = true
    const onVis = () => {
      isVisible = !document.hidden
    }
    document.addEventListener('visibilitychange', onVis)

    resize()
    requestAnimationFrame(resize)
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    window.addEventListener('resize', resize)
    window.addEventListener('orientationchange', resize)

    let raf = 0

    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!isVisible) return

      const linkSq = actualLinkDistance * actualLinkDistance
      const mouseSq = actualMouseRadius * actualMouseRadius
      const now = performance.now()

      ctx.clearRect(0, 0, cssWidth, cssHeight)

      // ---------- 涟漪 ----------
      // 移动端触摸时产生扩散环
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]
        const elapsed = now - rp.bornAt
        if (elapsed >= RIPPLE_LIFETIME) {
          ripples.splice(i, 1)
          continue
        }
        const t = elapsed / RIPPLE_LIFETIME
        const easeOut = 1 - Math.pow(1 - t, 3)
        const radius = easeOut * (isMobile ? 110 : 140)
        const alpha = (1 - t) * 0.5
        ctx.beginPath()
        ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(52, 211, 153, ${alpha})`
        ctx.lineWidth = 1.5
        ctx.stroke()
        // 内圈柔光
        ctx.beginPath()
        ctx.arc(rp.x, rp.y, radius * 0.45, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // ---------- 粒子位置更新 + 绘制 ----------
      // 物理模型：
      //   1) 没有鼠标干扰时，粒子按本征速度匀速漂浮（绝不会原地抽搐）
      //   2) 鼠标靠近时：施加方向力，让粒子短暂偏向（速度方向被改变，速度大小可能上升）
      //   3) 速度大小始终向 baseSpeed 平滑收敛（lerp），决定回归"自然漂浮"的节奏
      //   4) 不再每帧加随机扰动，避免噪点式抖动
      for (const p of particles) {
        if (pointerActive) {
          const mdx = p.x - pointerX
          const mdy = p.y - pointerY
          const md2 = mdx * mdx + mdy * mdy
          if (md2 < mouseSq) {
            const force = (1 - md2 / mouseSq) * 0.55
            const dist = Math.sqrt(md2) || 0.001
            // 桌面：排斥；移动：吸引
            const sign = isMobile ? -1 : 1
            p.vx += (sign * mdx / dist) * force * 0.22
            p.vy += (sign * mdy / dist) * force * 0.22
          }
        }

        // 速度大小向 baseSpeed 收敛（保留方向）
        // - 减速（被推开后）比加速（恢复）更慢，营造"被推开后缓缓滑回"的感觉
        const sp = Math.hypot(p.vx, p.vy)
        if (sp > 0.0001) {
          const lerpFactor = sp > p.baseSpeed ? 0.035 : 0.06
          const newMag = sp + (p.baseSpeed - sp) * lerpFactor
          p.vx = (p.vx / sp) * newMag
          p.vy = (p.vy / sp) * newMag
        } else {
          // 速度几乎为 0（极端情况），给一个新方向重启
          const angle = Math.random() * Math.PI * 2
          p.vx = Math.cos(angle) * p.baseSpeed
          p.vy = Math.sin(angle) * p.baseSpeed
        }

        p.x += p.vx
        p.y += p.vy

        // 边界环绕
        if (p.x < -10) p.x = cssWidth + 10
        else if (p.x > cssWidth + 10) p.x = -10
        if (p.y < -10) p.y = cssHeight + 10
        else if (p.y > cssHeight + 10) p.y = -10

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(220, 245, 235, ${p.baseAlpha})`
        ctx.fill()
      }

      // ---------- 连线 ----------
      // 简单 x 排序优化：按 x 排序后，内循环 x 差超过 linkDistance 时即可 break
      particles.sort((a, b) => a.x - b.x)
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = b.x - a.x
          if (dx > actualLinkDistance) break // 后续 x 距离更远，跳出
          const dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < linkSq) {
            const t = 1 - d2 / linkSq
            ctx.strokeStyle = `rgba(16, 185, 129, ${t * 0.32})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      // ---------- 指针光晕 ----------
      if (pointerActive) {
        for (const p of particles) {
          const mdx = p.x - pointerX
          const mdy = p.y - pointerY
          const md2 = mdx * mdx + mdy * mdy
          if (md2 < mouseSq) {
            const t = 1 - md2 / mouseSq
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.r + 2.5, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(52, 211, 153, ${t * 0.45})`
            ctx.fill()
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(255, 255, 255, ${t * 0.9})`
            ctx.fill()
          }
        }
      }
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', clearPointer)
      window.removeEventListener('resize', resize)
      window.removeEventListener('orientationchange', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [density, linkDistance, mouseRadius])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ display: 'block' }}
    />
  )
}
