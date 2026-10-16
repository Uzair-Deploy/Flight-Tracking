# Conceptual plan: improving flight-delay prediction

## Objective

Make the website's delay estimates more accurate, useful, and transparent by improving the data, prediction features, evaluation process, and connection between the model and live flight tracking. These steps are a plan, not a claim that the model has already improved; improvement must be demonstrated on representative historical data.

## 1. Define exactly what the model predicts

Choose a clear prediction target: estimated arrival delay in minutes and the probability that arrival will be more than 15 minutes late. Treat cancellations and diversions as separate outcomes, because they are not ordinary arrival-delay values.

Also define when a prediction is made. A prediction made before departure has less information than one made after the aircraft is airborne. For a live-tracking product, consider two prediction stages:

- **Before departure:** use only information available at that time.
- **During flight:** update the estimate as live status and progress information become available.

Evaluate these stages separately so the model is not credited with information it would not have had when the user requested a prediction.

## 2. Improve the quality and coverage of historical data

Build a consistent historical dataset that covers different months, seasons, carriers, routes, airports, and operating conditions. Standardize airport and carrier identifiers, date/time formats, missing values, duplicate records, and units. Check whether timestamps are local or UTC and treat them consistently.

Use actual arrival delay as the historical outcome to learn from, not as an input feature. Remove or separately handle cancelled and diverted flights. Investigate implausible records instead of allowing a small sample or data errors to drive conclusions.

More records alone do not guarantee better predictions: the data must be accurate, representative of the flights shown on the website, and aligned with the prediction time.

## 3. Add informative features that are genuinely available at prediction time

Start with dependable scheduled-flight information: carrier, origin and destination airports, scheduled departure time, day of week, month, and distance. These establish useful patterns across routes and times.

Then enrich the model with carefully prepared signals where available:

- Recent historical delay patterns for the origin airport, destination airport, carrier, and route.
- Airport congestion and operational disruption indicators for the relevant time window.
- Weather conditions and forecasts available at prediction time.
- For in-flight updates, current flight progress and the difference between scheduled and observed departure/progress times.

Calculate historical aggregates using earlier flights only. Join weather and congestion data to the correct airport and time window, and never use future realized conditions or fields that reveal the final delay. This prevents data leakage that can make offline scores look unrealistically good.

## 4. Compare models rather than assuming one algorithm is best

Keep a simple baseline, such as predicting a historical median delay for comparable flights. Compare it with the existing Random Forest and, if the dataset supports it, other tree-based models such as gradient boosting.

Use the same held-out flights to compare alternatives. Tune model settings using training/validation data only, and keep the final test period untouched until decisions are made. Prefer the model that performs reliably across time periods and airports, not just the model with the best score on one small sample.

## 5. Evaluate the model with the right metrics

For delay estimates in minutes, measure:

- **Mean Absolute Error (MAE):** the typical size of the prediction error in minutes.
- **Root Mean Squared Error (RMSE):** highlights large misses.
- **R²:** useful context, but it is not classification accuracy and may be negative.

For identifying flights delayed by more than 15 minutes, examine precision, recall, F1, and ranking metrics such as ROC-AUC and average precision. Check probability calibration too: flights assigned a 70% delay probability should be delayed at roughly that rate over a sufficiently large, comparable group.

Evaluate on a chronological holdout representing later flights than those used for training. Report results across airports, carriers, busy periods, and delay ranges. Compare against the baseline and state test-set size and date range. Do not claim improvement unless the new model beats the baseline on relevant holdout data without unacceptable regressions in important segments.

## 6. Connect the model to live flight tracking

Package the chosen model behind a reliable prediction service and connect it to the existing Spring Boot backend. The backend should request predictions using the latest flight data, validate required inputs, and return a consistent response to the frontend.

The response should communicate the estimated arrival delay, probability of being more than 15 minutes late, risk category, prediction timestamp, model version, and whether a prediction is available. The interface should distinguish predictions from official/live status and show when an estimate was last updated.

Refresh a prediction when useful new information arrives, subject to sensible rate limits. If required inputs or the model service are missing or fail, show that a prediction is unavailable rather than displaying invented or stale values as current estimates.

Risk labels such as low, medium, or high should be based on validated thresholds. They should not imply certainty, and probabilities should be calibrated before being presented as meaningful likelihoods.

## 7. Monitor performance after deployment

Store each prediction with its timestamp, model version, available input snapshot, and eventual actual outcome. When the flight lands, compare the estimate with the observed outcome. This makes it possible to detect drift as routes, seasons, schedules, congestion, and weather patterns change.

Track model error and delayed-flight classification quality over time and by important airport/carrier segments. Retrain only when sufficient recent, reliable labels are available, evaluate the replacement against the current model, and keep a rollback path if it performs worse.

## 8. Decide whether the change genuinely improved the product

Define success before deployment. At minimum, the candidate should outperform a simple baseline on a realistic chronological test set, deliver a useful error level in minutes, provide dependable delay-risk probabilities, and avoid large regressions for particular airports or carriers.

Then validate the full user experience: a live flight receives a prediction from real inputs, the timestamp is visible, estimates update when appropriate, failures are handled honestly, and the displayed values match the backend response.

## Current status and limitation

This document describes the recommended conceptual roadmap. Repository work has added a model-training foundation on the branch `improve/flight-delay-model-evaluation`, but the model has not been evaluated against the project's real historical dataset here. No measured improvement is claimed. The live prediction service and its integration with the Spring Boot backend and frontend still need to be validated before users can rely on the new estimates.
