<template>
  <div class="page about-page">
    <section class="about-intro">
      <span class="about-kicker"><span aria-hidden="true"></span> PROSHOCK COMMUNITY</span>
      <h1>Built to play.<br><span>Better together.</span></h1>
      <p>Meet other players, share your setup, and help shape what comes next.</p>
    </section>
    <div class="community-grid">
      <article class="community-card community-discord">
        <header><span class="community-platform"><MessagesSquare aria-hidden="true" /> Discord</span><span class="community-tag">GLOBAL</span></header>
        <h2>Find your people.</h2>
        <p>Join the conversation for updates, ideas, and community support.</p>
        <div class="community-qr discord-qr"><img :src="`${base}community/discord-invite.svg`" alt="Scan to join ProShock on Discord" width="256" height="256"></div>
        <span class="community-scan">Scan with your phone</span>
        <a class="community-action discord-action" href="https://discord.gg/WTVMsfuzG" target="_blank" rel="noopener noreferrer"><span>Join Discord</span><ArrowUpRight aria-hidden="true" /></a>
        <small class="community-address" data-i18n-ignore>discord.gg/WTVMsfuzG</small>
      </article>
      <article class="community-card community-qq">
        <header><span class="community-platform"><MessageCircle aria-hidden="true" /> QQ</span><span class="community-tag">中文社区</span></header>
        <h2>一起，把手感调到最好。</h2>
        <p>加入 ProShock 手柄主板交流群，聊配置、分享体验，一起解决问题。</p>
        <a class="community-qr qq-qr" :href="`${base}community/qq-group.jpg`" target="_blank" rel="noopener noreferrer" aria-label="View full QQ group QR code"><img :src="`${base}community/qq-group.jpg`" alt="ProShock手柄主板 QQ 群二维码，群号 741214243"></a>
        <span class="community-scan">使用 QQ 扫一扫，加入群聊</span>
        <a class="community-action qq-action" :href="`${base}community/qq-group.jpg`" target="_blank" rel="noopener noreferrer"><span>查看完整二维码</span><ArrowUpRight aria-hidden="true" /></a>
        <small class="community-address" data-i18n-ignore>QQ群 · 741214243</small>
      </article>
    </div>
    <footer class="about-footer"><strong data-i18n-ignore>ProShock 4</strong><span>Your controller. Your way.</span></footer>
  </div>
</template>
<script setup>
import { ArrowUpRight, MessageCircle, MessagesSquare } from "@lucide/vue";
const base = import.meta.env.BASE_URL;
</script>
<style scoped>
.about-page { max-width: 1100px; padding-top: 60px; }
.about-intro { max-width: 660px; margin: 0 auto 38px; text-align: center; }
.about-kicker { display: inline-flex; align-items: center; gap: 9px; color: var(--secondary); font: 10px var(--font-mono); letter-spacing: .18em; }
.about-kicker > span { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 45%, transparent); }
.about-intro h1 { margin: 20px 0 16px; font-size: clamp(34px, 5vw, 56px); line-height: 1.08; letter-spacing: -.045em; font-weight: 800; }
.about-intro h1 span { color: var(--accent); }
.about-intro p { margin: 0 auto; max-width: 480px; font-size: 14px; }
.community-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.community-card { min-width: 0; display: flex; flex-direction: column; align-items: center; padding: 28px; border: 1px solid var(--border-strong); border-radius: 20px; background: var(--surface-1); box-shadow: 0 16px 50px #0000000a; }
.community-card header { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 25px; }
.community-platform { display: inline-flex; align-items: center; gap: 9px; font-weight: 750; font-size: 17px; }
.community-platform svg { width: 22px; height: 22px; }
.community-discord .community-platform { color: var(--community-discord, #888fff); }
.community-qq .community-platform { color: var(--accent); }
.community-tag { font: 9px var(--font-mono); letter-spacing: .1em; color: var(--muted); border: 1px solid var(--border); border-radius: 20px; padding: 6px 9px; }
.community-card h2 { font-size: 22px; letter-spacing: -.025em; text-align: center; }
.community-card > p { max-width: 330px; min-height: 44px; margin: 12px 0 22px; font-size: 13px; text-align: center; }
.community-qr { display: block; position: relative; flex-shrink: 0; width: min(100%, 256px); aspect-ratio: 1; border-radius: 16px; overflow: hidden; }
.discord-qr { background: white; padding: 8px; }
.discord-qr img { display: block; width: 100%; height: 100%; }
/* Frame the supplied artwork without modifying the original QR image. */
.qq-qr { background: #252525; }
.qq-qr img { position: absolute; max-width: none; width: 138%; height: auto; left: -19%; top: -77%; }
.community-scan { margin: 14px 0 24px; color: var(--muted); font-size: 11px; }
.community-action { display: flex; width: 100%; align-items: center; justify-content: center; gap: 12px; padding: 13px 18px; border: 1px solid var(--border-strong); border-radius: 9px; text-decoration: none; font-size: 13px; font-weight: 700; transition: filter .15s, background .15s; }
.community-action svg { width: 17px; height: 17px; }
.discord-action { background: #5865f2; color: white; border-color: #5865f2; }
.qq-action { background: var(--surface-2); color: var(--text); }
.community-action:hover { filter: brightness(1.12); }
.community-action:focus-visible, .qq-qr:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
.community-address { margin-top: 12px; color: var(--muted); font: 10px var(--font-mono); }
.about-footer { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 32px; padding: 20px 0; border-top: 1px solid var(--border); color: var(--muted); font-size: 11px; }
.about-footer strong { color: var(--secondary); }
@media (max-width: 620px) { .about-page { padding-top: 32px; } .community-grid { grid-template-columns: 1fr; } .community-card { padding: 24px; } .about-intro { margin-bottom: 28px; } }
</style>
