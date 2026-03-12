import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("VITE_WEB_PUSH_PUBLIC_KEY=" + keys.publicKey);
console.log("WEB_PUSH_VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("WEB_PUSH_VAPID_PRIVATE_KEY=" + keys.privateKey);
