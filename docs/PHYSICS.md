# Physics & numerics reference

This document lists every model implemented in `src/core`, the equations used, and how each is validated. In-app, the **Learn** chapters explain the same material pedagogically.

## 1. Fourier boundaries (`core/geometry/surface.ts`)

VMEC convention, with `nfp` field periods and cylindrical angle φ:

R(θ,φ) = Σ RBC(m,n) cos(mθ − n·nfp·φ) + RBS(m,n) sin(mθ − n·nfp·φ)
Z(θ,φ) = Σ ZBS(m,n) sin(mθ − n·nfp·φ) + ZBC(m,n) cos(mθ − n·nfp·φ)

| Quantity | Formula | Test |
|---|---|---|
| Volume | V = ∫dφ ∮ ½R² ∂Z/∂θ dθ | simsopt, analytic torus |
| Area | ∫∫ \|r_θ × r_φ\| dθ dφ | simsopt, analytic torus |
| Mean cross-section Ā | ⟨\|∮ R dZ\|⟩_φ | — |
| Minor / major radius | a = √(Ā/π), R = V/(2πĀ) | simsopt (7 digits) |
| Principal curvatures | from fundamental forms (E,F,G), (L,M,N) | torus inboard K < 0 |
| Offset surface | displaced along unit normal, φ-plane re-projection by fixed-point iteration, then DFT refit | circular torus |

All integrands are smooth and periodic, so uniform grids converge spectrally.

## 2. Near-axis expansion (`core/nearAxis/qsc.ts`)

Port of pyQSC `init_axis`, `calculate_r1` and `calculate_grad_B_tensor`:

* Axis R₀(φ), Z₀(φ) Fourier series; Frenet frame, curvature κ, torsion τ (Landreman–Sengupta–Plunk sign convention).
* Boozer toroidal angle via cumulative trapezoid of dℓ/dφ; spectral differentiation matrix (DMSuite construction).
* σ-equation  σ' + (ι − N)(η̄⁴/κ⁴ + 1 + σ²) − 2(η̄²/κ²)(I₂/B₀ − s_ψ τ) G₀/B₀ = 0, unknowns (ι, σ₁…σ_{n−1}) with σ₀ fixed, solved by damped Newton with analytic Jacobian.
* Helicity N from quadrant counting of the normal vector.
* X₁c = η̄/κ, Y₁s = s_G s_ψ κ/η̄, Y₁c = s_G s_ψ κ σ/η̄, "untwisted" for QH.
* Elongation of the first-order ellipse; ∇B tensor (Landreman 2021 eq. 3.12), L∇B = B√(2/‖∇B‖²_F).
* Conversion to cylindrical boundary: Newton solve for the axis angle φ₀ whose surface point lies in plane φ.

Validation: `tests/nearAxis.test.ts` vs pyQSC for 7 configurations (ι to 1e-9, axis length 1e-10, max elongation and min L∇B 1e-5).

## 3. Coils & Biot–Savart (`core/coils`, `core/field/biotSavart.ts`)

* simsopt `CurveXYZFourier` file format; `coils_via_symmetries` semantics (rotation by 2πk/nfp, reflection (x,y,z)→(x,−y,−z) with reversed current).
* Exact polyline field (Hanson & Hirshman 2002).
* Lorentz force dF/dℓ = I t̂ × B_ext (other coils only).
* Mutual inductance by Neumann's formula; self-inductance regularised with δ = a²/√e (Hurwitz, Landreman & Antonsen); energy W = ½ΣMᵢⱼIᵢIⱼ with symmetry folding.

Validation: circular-loop analytic field; simsopt BiotSavart for W7-X, NCSX, HSX (< 1e-4 relative, 768 segments/coil); W7-X energy within the 300–800 MJ band around the ≈ 600 MJ engineering value.

## 4. REGCOIL (`core/coils/regcoil.ts`)

Φ = Σ Φ_k sin(m_kθ − n_k·nfp·ζ) + Gζ/2π + Iθ/2π,  K = (Φ_θ r_ζ − Φ_ζ r_θ)/|N|.
B·n(x) = μ₀/4π ∫ (Φ_θ r_ζ − Φ_ζ r_θ)·(r × n̂)/|r|³ dθ'dζ' (Biot–Savart for a sheet current), linear in Φ_k.
Minimise ∫B_n² dA + λ∫|K|² dA via normal equations + Cholesky. The kernel is folded over periods (basis functions are nfp-periodic). Coils: contours Φ_tot = G(k+½)/N found by bisection in ζ along each θ.

Validation: axisymmetric torus (B·n ≡ 0, Φ_sv ≈ 0); LP-QA RMS B·n < 0.5 % B₀; λ trade-off monotonic; full pipeline recovers ι ≈ 0.42.

## 5. Field lines (`core/field/grid.ts`, `core/field/fieldlines.ts`)

* Grid: (B_R, B_φ, B_Z) on nR × nZ × nφ per period (periodic), tricubic Lagrange interpolation.
* ODE in φ: dR/dφ = R B_R/B_φ, dZ/dφ = R B_Z/B_φ, dℓ/dφ = R|B|/|B_φ|, RK4.
* Axis: Newton on P(x) − x with central-difference monodromy M; Greene's residue (2 − tr M)/4; ι₀ = nfp·arccos(tr M/2)/2π (mod nfp/2).
* ι for each line: continuous unwrap of the poloidal angle around the simultaneously traced axis.

Validation: W7-X standard configuration axis R = 5.949 m, Z = 0 at φ = 0; ι₀ ≈ 0.857; trace ι within 0.05 of the monodromy estimate.

## 6. Reactor physics (`core/physics`)

* Bosch–Hale ⟨σv⟩ for D-T, D-D (both branches), D-³He.
* ISS04 τ_E = 0.134 a^2.28 R^0.64 P^−0.61 n̄^0.54 B^0.84 ι_{2/3}^0.41 (×f_ren).
* Sudo n_c = 0.25 √(P B / a²R).
* Steady state P_α + P_aux = W/τ_E + P_brems with parabolic profiles, 16-point Gauss–Legendre volume averages; P_aux solved by bisection so that required τ_E = f_ren τ_ISS04 (or ignition).
* Lawson ignition and fixed-Q curves for flat profiles.

## Sources

See the in-app References page or `src/data/references.ts` for the complete, linked bibliography.
