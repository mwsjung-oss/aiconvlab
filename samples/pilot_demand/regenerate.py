"""Pilot 수요 샘플 CSV 재생성 (저장소 루트에서 실행 권장)."""
import csv
import math
import os
import random

random.seed(42)

HERE = os.path.dirname(os.path.abspath(__file__))


def main() -> None:
    rows = []
    for w in range(1, 81):
        price_index = 0.92 + 0.12 * random.random()
        promo = random.random() * 0.35
        comp_ad = 400 + random.random() * 350
        seasonal = 0.85 + 0.25 * math.sin(w / 8.0) + 0.05 * random.random()
        base = 80 + 40 * seasonal + 25 * promo - 30 * (price_index - 1.0) - 0.02 * comp_ad
        noise = random.gauss(0, 12)
        demand = max(20, base + noise)
        rows.append(
            [
                w,
                round(price_index, 4),
                round(promo, 4),
                round(comp_ad, 2),
                round(seasonal, 4),
                round(demand, 2),
            ]
        )
    train_path = os.path.join(HERE, "pilot_demand_train.csv")
    with open(train_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "week_idx",
                "price_index",
                "promo_depth",
                "competitor_ad_spend",
                "seasonal_factor",
                "product_weekly_demand",
            ]
        )
        w.writerows(rows)

    score = []
    for w in range(81, 101):
        price_index = 0.94 + 0.1 * random.random()
        promo = random.random() * 0.4
        comp_ad = 420 + random.random() * 300
        seasonal = 0.88 + 0.22 * math.sin(w / 7.0) + 0.04 * random.random()
        score.append(
            [
                w,
                round(price_index, 4),
                round(promo, 4),
                round(comp_ad, 2),
                round(seasonal, 4),
            ]
        )
    score_path = os.path.join(HERE, "pilot_demand_scoring.csv")
    with open(score_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "week_idx",
                "price_index",
                "promo_depth",
                "competitor_ad_spend",
                "seasonal_factor",
            ]
        )
        w.writerows(score)

    print("Wrote", train_path, score_path)


if __name__ == "__main__":
    main()
