# NextProblem: Live Viva Defense & CS Fundamentals Guide

> **Prepared for Second-Year CS Viva Examination**  
> Problem Statement: NextProblem (CodeSangam Webster 2026)  
> Student Oral Defense Preparation

---

## 1. Top 10 Viva Questions & Exact Answers

### Q1: What is the core problem NextProblem solves?
**Answer:**  
In competitive programming, practicing problems that are either too easy (>85% solve probability) or impossibly hard (<25% solve probability) leads to wasted time and frustration. Learning theory (Vygotsky’s *Zone of Proximal Development*) establishes that optimal skill growth occurs when students tackle tasks in their **50% to 70% success window**, specifically targeting their algorithmic weak areas. NextProblem predicts this probability for any Codeforces problem and delivers a customized 7-day practice schedule.

---

### Q2: Why did you not use an LLM (like GPT-4) or a paid cloud API?
**Answer:**  
Three core engineering reasons:
1. **Explainability & Scientific Rigor:** An LLM is a black-box text generator that cannot guarantee calibrated numerical probabilities ($P \in [0, 1]$). Logistic regression is mathematically transparent; every weight represents an interpretable log-odds multiplier.
2. **Zero Cost & Out-of-the-Box Operation:** Our architecture requires \$0 server infrastructure and 0 API keys.
3. **Latency & Offline Readiness:** An LLM API call takes 800–2,000 ms over the network. Our exported model scores 1,000 problems in **~2 milliseconds** inside a browser Web Worker completely offline.

---

### Q3: How did you prevent Data Leakage in your ML pipeline?
**Answer:**  
We enforced two strict invariants:
1. **Temporal Splitting (Not Random Split):** We sorted all (user, problem) encounters chronologically by the timestamp of the user's first attempt ($t_{\text{first}}$). The earliest 80% form the Training set; the latest 20% form the Unseen Test set. Testing on the future prevents the model from memorizing future trends.
2. **Sequential Cumulative Features:** When evaluating a problem attempt at time $t_{\text{first}}$, features like `tag_solve_rate` and `tag_attempts` were computed **strictly from submissions with $t < t_{\text{first}}$**. Counters were updated only after recording the prediction row.

---

### Q4: Why did you choose Logistic Regression over a Deep Neural Network?
**Answer:**  
1. **Occam’s Razor & Sample Efficiency:** For tabular problem-encounter data with ~1,500 samples, deep neural networks overfit severely. Logistic regression with L2 regularization is convex, guarantees a globally optimal solution, and resists overfitting.
2. **Zero ML Runtime Deployment:** A neural network requires WebAssembly libraries (TensorFlow.js / ONNX) weighing 15–25 MB. Logistic regression inference is simply:
   $$z = b + \sum_{j=1}^5 w_j \left(\frac{x_j - \mu_j}{\sigma_j}\right), \quad P = \frac{1}{1 + e^{-z}}$$
   This runs in standard TypeScript using elementary arithmetic in under 3 microseconds per problem.

---

### Q5: How do your model's metrics compare to the Elo baseline? Did it beat the baseline?
**Answer:**  
*Examiners appreciate scientific honesty over inflated claims:*
- **On Probability Calibration (Log Loss & Brier Score):** **Yes, our model decisively beats both baselines.**
  - Our Log Loss is **0.1466**, beating Elo Baseline (0.6328) by **-0.4862**.
  - Our Brier Score is **0.0312**, which is over **5x lower error** than Elo (0.1783).
  - *Reason:* Standard Elo assumes a 50% base rate when user rating equals problem rating ($\Delta = 0$). In competitive programming, users self-select problems they attempt, resulting in an empirical solve rate of ~92%. Our model captures this calibrated base-rate intercept ($b = +2.85$).
- **On Rank Discrimination (ROC-AUC):** Our model scored **0.7063**, trailing Elo's **0.7254** by 0.0191. Elo is a monotonic single-feature curve, whereas multi-feature models on compact datasets face slight variance.

---

### Q6: What does each feature weight physically mean?
**Answer:**  
The model standardizes features ($z$-scores), so weights represent the change in log-odds per standard deviation:
1. **`tag_solve_rate` ($w = +0.5373$):** The strongest positive predictor. Even controlling for rating, past success on that specific tag dramatically boosts solve probability.
2. **`rating_gap` ($w = +0.4543$):** Strong positive predictor (higher user rating relative to problem rating).
3. **`tag_attempts` ($w = -0.3328$):** Negative predictor. Excessive repeated attempts on a tag indicate the user is struggling on that algorithmic topic.
4. **`problem_rating` ($w = -0.1664$):** Negative predictor (higher difficulty lowers solve probability).
5. **`user_rating` ($w = +0.2789$):** Positive baseline skill factor.

---

### Q7: Why Laplace Smoothing for Tag Solve Rates?
**Answer:**  
If a user has never attempted a problem with a given tag, dividing $\frac{\text{solved}}{\text{attempts}} = \frac{0}{0}$ results in `NaN` or division by zero.  
We apply Laplace add-1 smoothing:
$$\text{solve\_rate} = \frac{\text{solved} + 1}{\text{attempts} + 2}$$
When $\text{attempts} = 0$, this evaluates to $0.5$ (a neutral 50% prior probability). As attempts increase, the empirical evidence smoothly dominates.

---

### Q8: Why did you not need a backend server (Node/Express/Django)?
**Answer:**  
We inspected the HTTP headers of the official public Codeforces API using `curl -I`:
```http
access-control-allow-origin: *
```
Codeforces natively permits Cross-Origin Resource Sharing (CORS). Since Codeforces allows browser GET requests, and our ML model runs in a client-side Web Worker, a proxy backend would only add unnecessary latency, hosting costs, and points of failure.

---

### Q9: How does the application work offline?
**Answer:**  
1. **Bundled Snapshots:** The repo bundles `web/public/data/problems_snapshot.json` (1,200 curated rated problems) and `demo_users.json` (4 preloaded profiles: `tourist`, `Petr`, `Errichto`, `SecondThread`).
2. **IndexedDB Local Cache:** Every fetched user and submission list is cached asynchronously in browser IndexedDB.
3. **Service Worker (`sw.js`):** Intercepts network requests and caches the HTML, JS, CSS, and data JSON files so the app loads when airplane mode is on.

---

### Q10: How do you handle failure modes (new user, rate limits, invalid handles)?
**Answer:**  
1. **New/Unrated User:** If Codeforces returns null for rating (or a new user with 0 submissions), the app defaults their rating to 1200 (standard Pupil baseline) and displays an onboarding notice.
2. **API Rate Limit (HTTP 429) or Outage:** The frontend catches the fetch error and falls back to IndexedDB or bundled demo snapshots without crashing.
3. **Malformed Handle:** Validates handle input format and catches HTTP 400 responses with an informative error toast.

---

## 2. Mathematical Reference Cheat Sheet

| Concept | Mathematical Equation | Purpose |
| :--- | :--- | :--- |
| **Sigmoid Function** | $\sigma(z) = \frac{1}{1 + e^{-z}}$ | Maps real-valued log-odds $z \in (-\infty, \infty)$ to probability $[0, 1]$. |
| **Linear Combination** | $z = b + \sum_{j=1}^5 w_j \left(\frac{x_j - \mu_j}{\sigma_j}\right)$ | Computes standard dot product using standardized weights and feature scalers. |
| **Elo Expected Probability** | $P = \frac{1}{1 + 10^{-(R_u - R_p) / 400}}$ | Baseline B competitive rating formula. |
| **Log Loss (Cross-Entropy)** | $-\frac{1}{N} \sum_{i=1}^N \left[ y_i \ln(p_i) + (1 - y_i) \ln(1 - p_i) \right]$ | Measures accuracy of predicted probabilities. |
| **Brier Score** | $\frac{1}{N} \sum_{i=1}^N (p_i - y_i)^2$ | Mean squared error of probabilities (calibration measure). |
| **Laplace Smoothing** | $\hat{p} = \frac{k + 1}{n + 2}$ | Prevents division by zero for unattempted tags. |
