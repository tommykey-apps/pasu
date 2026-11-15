# WebAuthn と FIDO の違い

どちらも passkey を動かすための規格の名前です。決めた団体と、どこの通信を決めているかが違います。

```
Web ページ ──(WebAuthn)──▶ ブラウザ / OS ──(CTAP)──▶ 外付けの認証器 (セキュリティキーなど)
                                  │
                                  └──(CTAP の対象外)──▶ 端末に内蔵の認証器
```

| 名前 | 決めた団体 | 決めている範囲 |
|---|---|---|
| Web Authentication (WebAuthn) | World Wide Web Consortium (W3C) | Web ページがブラウザに登録やログインを頼む JS の API (`navigator.credentials`) |
| Client to Authenticator Protocol (CTAP) | FIDO Alliance | ブラウザや OS が、USB・NFC・Bluetooth でつながる外付けの認証器とやりとりする手順。端末に内蔵の認証器は対象外 |
| FIDO2 | FIDO Alliance | WebAuthn と CTAP を合わせた呼び名 |
| passkey | FIDO Alliance、W3C | FIDO の規格に基づく認証用の鍵。WebAuthn の仕様では、ユーザー名を入れずに使える鍵 (discoverable credential) の別名。端末間で同期するもの (synced passkey) と、セキュリティキーなど1台に固定したもの (device-bound passkey) がある |

FIDO Alliance は、フィッシングに強い認証の規格を作る業界団体です。このアプリが直接使うのは WebAuthn だけで、CTAP はブラウザと OS が受け持ちます。
