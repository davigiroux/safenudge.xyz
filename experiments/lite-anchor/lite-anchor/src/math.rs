//! Arithmetic the upstream BPF target cannot emit directly.

/// `i64::checked_div`, computed with unsigned division.
///
/// Upstream LLVM lowers `i64` division to the BPF v4 signed `div`, which SBPF rejects, and with
/// `--disable-sdiv-smod` it refuses signed division outright. The Solana platform-tools fork
/// expands it for you; upstream does not yet. Same result as `i64::checked_div` for every input:
/// truncates toward zero, `None` on a zero divisor or `i64::MIN / -1`.
#[inline(always)]
pub const fn checked_div_i64(a: i64, b: i64) -> Option<i64> {
    if b == 0 || (a == i64::MIN && b == -1) {
        return None;
    }
    let Some(q) = a.unsigned_abs().checked_div(b.unsigned_abs()) else {
        return None;
    };
    if (a < 0) != (b < 0) {
        // `q` is at most 2^63 here, and `0 - 2^63` wraps to exactly `i64::MIN`.
        Some(0_i64.wrapping_sub_unsigned(q))
    } else {
        // Same signs: `q` is at most `i64::MAX`, since `i64::MIN / -1` was rejected above.
        Some(0_i64.wrapping_add_unsigned(q))
    }
}

#[cfg(test)]
mod tests {
    use super::checked_div_i64;

    #[test]
    fn matches_core_checked_div() {
        let values = [
            i64::MIN,
            i64::MIN + 1,
            -604_800,
            -604_799,
            -7,
            -1,
            0,
            1,
            7,
            604_799,
            604_800,
            i64::MAX - 1,
            i64::MAX,
        ];
        for &a in &values {
            for &b in &values {
                assert_eq!(checked_div_i64(a, b), a.checked_div(b), "{a} / {b}");
            }
        }
    }
}
