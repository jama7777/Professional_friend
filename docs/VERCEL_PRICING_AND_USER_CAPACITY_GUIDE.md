# 📊 Vercel Hosting Costs, Free Limits & Daily User Capacity Guide

A comprehensive architectural and cost breakdown for hosting **Professional Friend (3D AI Interviewer & Biometric Platform)** on **Vercel** and associated AI APIs.

---

## 📌 Executive Summary

| Category | Platform | Free Tier Allowance | Est. Daily Active Users (DAU) | Cost |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend & 3D Assets** | **Vercel Hobby** | **100 GB Bandwidth / month** | **400 – 700 full interviews/day** | **$0.00** |
| **Primary AI Engine** | **Gemini 2.5 Flash** | **1,500 requests / day (Free Tier)** | **100 – 150 full interviews/day** | **$0.00** |
| **Fallback AI Engine** | **Mistral Large** | **1 req/sec & free trial credits** | **Fallback & real-time question fetch** | **$0.00** |
| **Voice STT / TTS** | **Deepgram** | **$200 free credit (~45,000 mins)** | **~3,000 full audio interviews** | **$0.00** |

> [!TIP]
> **Bottom Line**: You can comfortably run **100 to 150 comprehensive mock interviews per day (3,000 to 4,500 interviews per month)** with full 3D avatars, real-time question generation, and AI evaluations **at exactly $0 / month**.

---

## 🌐 1. Vercel Free Tier (Hobby Plan) Breakdown

Vercel provides a generous free tier for personal and hobby projects with **no surprise charges** (it does not charge your card; if you hit limits, it simply pauses or notifies you).

### Vercel Hobby Quotas:
| Metric | Monthly Free Limit | Usage in Professional Friend |
| :--- | :--- | :--- |
| **Fast Data Transfer (Bandwidth)** | **100 GB / month** | Initial page load + 3D assets (~8 MB first load, cached thereafter) |
| **Serverless Function Executions** | **100 GB-hours / month** | API proxy rewrites (`/api/mistral`, `/api/deepgram`) |
| **Edge Requests / Rewrites** | **1,000,000 requests / month** | Proxy routing to AI endpoints |
| **Deployments** | **Unlimited** | Git commits & preview branches |
| **Custom Domains & SSL** | **Unlimited Free HTTPS** | `professional-friend.is-a.dev` or custom `.com` |

---

## 🧮 2. Bandwidth & Daily User Capacity Math

### Payload Consumption per User:
1. **First-Time Visitor (Cold Cache)**:
   - React + Vite bundle: `~1.0 MB` (gzip)
   - 3D Ready Player Me Avatar (`aura.glb`): `~4.5 MB`
   - Mixamo Gesture & Sitting Animations (`.fbx`): `~2.5 MB`
   - **Total initial download**: `~8.0 MB`

2. **Repeat Visitor / In-Session Chat (Warm Cache)**:
   - 3D models and assets are cached by the browser (`Cache-Control` / HTTP 304).
   - Text & JSON API responses per interview: `~0.2 MB`.

### Daily Capacity Scenarios on 100 GB Free Bandwidth:

$$\text{Monthly Bandwidth} = 100\text{ GB} = 100,000\text{ MB}$$

| User Behavior Scenario | Data per Session | Max Sessions / Month | **Max Daily Users (DAU)** |
| :--- | :--- | :--- | :--- |
| **100% Brand New Visitors** (cold load + 10 Qs) | ~8.2 MB | ~12,200 sessions | **~405 users / day** |
| **Mix (50% New, 50% Returning)** | ~4.2 MB | ~23,800 sessions | **~790 users / day** |
| **Returning Users Practicing Daily** | ~0.5 MB | ~200,000 sessions | **~6,600 users / day** |

---

## 🤖 3. AI Model Limits & Daily Chat Capacity

Since the frontend is served statically, the bottleneck for daily chat volume is determined by your **AI API keys**:

### A. Google Gemini 2.5 Flash (Free Tier)
- **Rate Limit**: 15 Requests Per Minute (RPM)
- **Daily Quota**: **1,500 Requests Per Day (RPD)**
- **Tokens**: 1,000,000 Tokens Per Minute (TPM)
- **Daily Capacity Calculation**:
  - Average interview: **10 to 12 question turns** + **1 final evaluation report**.
  - Total requests per full interview: `~11 - 13 requests`.
  - **Free capacity**: $\frac{1,500 \text{ RPD}}{12 \text{ requests}} \approx \mathbf{125 \text{ complete interviews / day}}$.

### B. Mistral Large (`mistral-large-latest`)
- **Rate Limit**: 1 request/second
- **Usage in App**: Fetches 15-question company banks and acts as fallback.
- **Cost**: Free trial / Pay-as-you-go ($0.002 / 1k input tokens — fractions of a cent per interview).

### C. Deepgram Speech-to-Text & Aura TTS
- **Free Credit**: **$200 on signup**
- **Cost per hour of speech**: ~$0.26 / hour
- **Capacity with $200 credit**: `~750 hours of continuous speech` ($\approx 3,000 \text{ full mock interviews}$).

---

## 📈 4. Scaling Cost Projections (If You Exceed Free Limits)

If your app goes viral and scales past the free tier, here is the cost breakdown:

| Scale Tier | Daily Active Users | Monthly Interviews | Vercel Cost | AI API Cost | Total Cost / Month |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hobby (Current)** | **0 – 150 DAU** | **0 – 4,500** | **$0.00 (Free)** | **$0.00 (Free tiers)** | **$0.00** |
| **Growing** | **500 DAU** | **15,000** | $20 (Vercel Pro) | ~$10 - $15 | **~$30 – $35 / mo** |
| **Viral / Campus Scale** | **2,000 DAU** | **60,000** | $20 (Vercel Pro) | ~$45 - $60 | **~$65 – $80 / mo** |

---

## 💡 5. Recommended Optimizations to Maximize Free Capacity

1. **Leverage Cloudflare CDN in Front of Vercel / GitHub Pages**:
   - Cloudflare caches 3D `.glb` and `.fbx` assets at edge servers with **unlimited free bandwidth**.
2. **IndexedDB Local Storage** *(Already Implemented)*:
   - Question history, evaluations, and scores are stored client-side in the user's browser, eliminating database server costs.
3. **Session-Level Rate Limiting**:
   - Capping single interviews to 15 questions preserves your 1,500 daily Gemini requests for more unique candidates.
