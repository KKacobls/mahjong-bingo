# 麻將賓果 v2 物理版

網址：https://kkacobls.github.io/mahjong-bingo/v2/

原版位於 ../index.html，v2 獨立目錄不覆蓋原有網站。
功能：每局 6～30 張、聽牌後繼續抽 5 張（設定可調）、補摸沒中的牌重力落下、點左右側牌池摸牌、手機晃動攪動剩餘牌池。晃動不更改抽牌結果；iOS Safari 必須按鈕授權感應，且網站使用 HTTPS。

v2/index.html、v2/style.css、v2/app.mjs 為前端原始碼。為避免重複資產，v2/app.mjs 引用 ../dist 的計算、紀錄、音效、碰撞模組以及牌圖。請使用 GitHub Pages 或本地 HTTP server 測試，不要直接使用 file:// 開啟。
