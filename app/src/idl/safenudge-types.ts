/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/safenudge.json`.
 */
export type Safenudge = {
  "address": "GxruFdaFHYPv9MqhFM2MoFWyYNXGnmhdTpy1MFHXJSUc",
  "metadata": {
    "name": "safenudge",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Group accountability savings protocol on Solana"
  },
  "instructions": [
    {
      "name": "closeMemberRecord",
      "discriminator": [
        187,
        153,
        209,
        15,
        229,
        52,
        107,
        209
      ],
      "accounts": [
        {
          "name": "groupConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  111,
                  117,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "group_config.group_code",
                "account": "groupConfig"
              }
            ]
          }
        },
        {
          "name": "memberRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "groupConfig"
              },
              {
                "kind": "account",
                "path": "member_record.member",
                "account": "memberRecord"
              }
            ]
          }
        },
        {
          "name": "rentPayer",
          "docs": [
            "not a signer or an authority. The constraint on `member_record` pins its key to the",
            "wallet that signed and paid at join_group, so the caller cannot redirect the rent."
          ],
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "createGroup",
      "discriminator": [
        79,
        60,
        158,
        134,
        61,
        199,
        56,
        248
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "rentPayer",
          "docs": [
            "Pays the rent of group_config and of the vault, and is recorded as the destination of the",
            "vault rent refund. May be the same key as `creator`."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "groupConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  111,
                  117,
                  112
                ]
              },
              {
                "kind": "arg",
                "path": "groupCode"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "groupConfig"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "groupCode",
          "type": "string"
        },
        {
          "name": "depositAmount",
          "type": "u64"
        },
        {
          "name": "frequency",
          "type": "u8"
        },
        {
          "name": "totalPeriods",
          "type": "u8"
        },
        {
          "name": "maxMembers",
          "type": "u8"
        },
        {
          "name": "penaltyType",
          "type": "u8"
        },
        {
          "name": "penaltyValue",
          "type": "u64"
        }
      ]
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "member",
          "signer": true
        },
        {
          "name": "groupConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  111,
                  117,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "group_config.group_code",
                "account": "groupConfig"
              }
            ]
          }
        },
        {
          "name": "memberRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "groupConfig"
              },
              {
                "kind": "account",
                "path": "member"
              }
            ]
          }
        },
        {
          "name": "memberTokenAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "groupConfig"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "distribute",
      "discriminator": [
        191,
        44,
        223,
        207,
        164,
        236,
        126,
        61
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Permissionless caller triggering settlement. Pays only the transaction",
            "fee — never rent (the treasury ATA is pre-created via `init_treasury`)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "groupConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  111,
                  117,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "group_config.group_code",
                "account": "groupConfig"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "groupConfig"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "treasuryAuthority",
          "docs": [
            "PDA that owns the protocol treasury ATA. Holds no data; SystemAccount",
            "validates ownership and gives Anchor the seed/bump derivation it needs",
            "to sign the withdraw_fees CPI later."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "treasuryTokenAccount",
          "docs": [
            "Treasury ATA for this mint, created ahead of time by FEE_RECIPIENT via",
            "`init_treasury` — never initialized here, so a permissionless caller",
            "can't be griefed into paying its rent. Optional: required only when a",
            "protocol fee is due this settlement (enforced in the handler); when",
            "passed, the associated_token constraints pin it to the canonical ATA of",
            "(mint, treasury_authority), so no other destination can receive the fee."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasuryAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "emergencyCancel",
      "discriminator": [
        92,
        73,
        255,
        17,
        197,
        5,
        46,
        75
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true,
          "relations": [
            "groupConfig"
          ]
        },
        {
          "name": "groupConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  111,
                  117,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "group_config.group_code",
                "account": "groupConfig"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "groupConfig"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "initTreasury",
      "discriminator": [
        105,
        152,
        173,
        51,
        158,
        151,
        49,
        14
      ],
      "accounts": [
        {
          "name": "feeRecipient",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryAuthority",
          "docs": [
            "PDA with authority over all treasury token accounts. Holds no data."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "treasuryTokenAccount",
          "docs": [
            "Canonical ATA of (mint, treasury_authority). `init` (not",
            "`init_if_needed`): calling twice fails, which is fine for a one-shot."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasuryAuthority"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "mint",
          "docs": [
            "Any mint — groups are per-mint (`group_config.mint`) while the treasury",
            "authority PDA is global, so the protocol holds one ATA per supported mint."
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "joinGroup",
      "discriminator": [
        121,
        56,
        199,
        19,
        250,
        70,
        44,
        184
      ],
      "accounts": [
        {
          "name": "member",
          "signer": true
        },
        {
          "name": "rentPayer",
          "docs": [
            "Pays the member_record rent and is recorded as the destination of that rent when the",
            "record is closed. May be the same key as `member`."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "groupConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  111,
                  117,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "group_config.group_code",
                "account": "groupConfig"
              }
            ]
          }
        },
        {
          "name": "memberRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "groupConfig"
              },
              {
                "kind": "account",
                "path": "member"
              }
            ]
          }
        },
        {
          "name": "memberTokenAccount",
          "docs": [
            "Must be the member's canonical ATA for the group mint (pins owner and",
            "mint too). Settlement derives each member's ATA deterministically, so",
            "accepting any other token account here would brick the whole group at",
            "distribute time (issue #44 M-3)."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "member"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "groupConfig"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "refundVaultRent",
      "discriminator": [
        190,
        180,
        141,
        236,
        38,
        122,
        76,
        152
      ],
      "accounts": [
        {
          "name": "groupConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  111,
                  117,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "group_config.group_code",
                "account": "groupConfig"
              }
            ]
          }
        },
        {
          "name": "rentPayer",
          "docs": [
            "not a signer or an authority. The constraint on `group_config` pins its key to the",
            "wallet that signed and paid at create_group, so the caller cannot redirect the refund."
          ],
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "startCycle",
      "discriminator": [
        203,
        152,
        115,
        167,
        17,
        252,
        73,
        86
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "groupConfig"
          ]
        },
        {
          "name": "groupConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  111,
                  117,
                  112
                ]
              },
              {
                "kind": "account",
                "path": "group_config.group_code",
                "account": "groupConfig"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "withdrawFees",
      "discriminator": [
        198,
        212,
        171,
        109,
        144,
        215,
        174,
        89
      ],
      "accounts": [
        {
          "name": "recipient",
          "writable": true,
          "signer": true
        },
        {
          "name": "treasuryAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "recipientTokenAccount",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "groupConfig",
      "discriminator": [
        115,
        110,
        71,
        114,
        111,
        117,
        112,
        50
      ]
    },
    {
      "name": "memberRecord",
      "discriminator": [
        115,
        110,
        77,
        101,
        109,
        98,
        114,
        50
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidGroupStatus",
      "msg": "Group is not in the correct status for this action"
    },
    {
      "code": 6001,
      "name": "groupFull",
      "msg": "Group is full"
    },
    {
      "code": 6002,
      "name": "unauthorizedCreator",
      "msg": "Only the group creator can perform this action"
    },
    {
      "code": 6003,
      "name": "insufficientMembers",
      "msg": "Group needs at least 2 members to start"
    },
    {
      "code": 6004,
      "name": "cycleNotEnded",
      "msg": "Cycle has not ended yet"
    },
    {
      "code": 6005,
      "name": "alreadyDeposited",
      "msg": "Already deposited for this period"
    },
    {
      "code": 6006,
      "name": "cycleEnded",
      "msg": "Cycle has ended, no more deposits accepted"
    },
    {
      "code": 6007,
      "name": "invalidGroupCode",
      "msg": "Invalid group code format"
    },
    {
      "code": 6008,
      "name": "invalidPenaltyConfig",
      "msg": "Invalid penalty configuration"
    },
    {
      "code": 6009,
      "name": "invalidFrequency",
      "msg": "Invalid frequency value"
    },
    {
      "code": 6010,
      "name": "invalidGroupSize",
      "msg": "Invalid group size"
    },
    {
      "code": 6011,
      "name": "invalidPeriodCount",
      "msg": "Invalid period count"
    },
    {
      "code": 6012,
      "name": "invalidDepositAmount",
      "msg": "Deposit amount must be greater than zero"
    },
    {
      "code": 6013,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6014,
      "name": "invalidMint",
      "msg": "Token mint does not match group configuration"
    },
    {
      "code": 6015,
      "name": "memberCountMismatch",
      "msg": "Member count mismatch in distribution"
    },
    {
      "code": 6016,
      "name": "invalidAccountOwner",
      "msg": "Account is not owned by this program"
    },
    {
      "code": 6017,
      "name": "invalidMemberRecord",
      "msg": "Member record does not match the canonical PDA for its member"
    },
    {
      "code": 6018,
      "name": "invalidTokenAccountOwner",
      "msg": "Destination token account does not belong to the expected member"
    },
    {
      "code": 6019,
      "name": "duplicateMemberRecord",
      "msg": "The same member record was passed more than once"
    },
    {
      "code": 6020,
      "name": "unauthorizedRecipient",
      "msg": "Recipient is not the configured FEE_RECIPIENT"
    },
    {
      "code": 6021,
      "name": "noFeesToWithdraw",
      "msg": "Treasury has no fees to withdraw"
    },
    {
      "code": 6022,
      "name": "treasuryNotInitialized",
      "msg": "Protocol treasury token account for this mint has not been initialized"
    },
    {
      "code": 6023,
      "name": "invalidRentPayer",
      "msg": "Rent refund destination does not match the recorded rent payer"
    }
  ],
  "types": [
    {
      "name": "groupConfig",
      "docs": [
        "One savings group. Never closed.",
        "",
        "Every fixed-size field comes before `group_code`, the only variable-length one, so each field",
        "above it sits at the same byte offset in every group and clients can `memcmp`-filter on it."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "docs": [
              "Offset 8. Group creator wallet: can start_cycle and emergency_cancel."
            ],
            "type": "pubkey"
          },
          {
            "name": "rentPayer",
            "docs": [
              "Offset 40. Paid the rent of this account and of the vault at create_group. The only",
              "destination of the vault rent refund. Equals `creator` when the creator paid."
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "docs": [
              "Offset 72. USDC mint address."
            ],
            "type": "pubkey"
          },
          {
            "name": "depositAmount",
            "docs": [
              "Offset 104. Fixed deposit amount per period (token smallest unit)."
            ],
            "type": "u64"
          },
          {
            "name": "penaltyValue",
            "docs": [
              "Offset 112. Penalty value: fixed amount in token units, or basis points (500 = 5%)."
            ],
            "type": "u64"
          },
          {
            "name": "cycleStart",
            "docs": [
              "Offset 120. Unix timestamp when the cycle started; 0 while Open."
            ],
            "type": "i64"
          },
          {
            "name": "settledAt",
            "docs": [
              "Offset 128. Unix timestamp of distribute or emergency_cancel; 0 until then."
            ],
            "type": "i64"
          },
          {
            "name": "frequency",
            "docs": [
              "Offset 136. 0 = weekly, 1 = biweekly, 2 = monthly."
            ],
            "type": "u8"
          },
          {
            "name": "totalPeriods",
            "docs": [
              "Offset 137. Number of deposit periods in the cycle (1-52)."
            ],
            "type": "u8"
          },
          {
            "name": "maxMembers",
            "docs": [
              "Offset 138. Max group size (2-10)."
            ],
            "type": "u8"
          },
          {
            "name": "currentMembers",
            "docs": [
              "Offset 139. Members who joined. Not decremented when a member record is closed."
            ],
            "type": "u8"
          },
          {
            "name": "penaltyType",
            "docs": [
              "Offset 140. 0 = fixed amount, 1 = percentage (basis points)."
            ],
            "type": "u8"
          },
          {
            "name": "status",
            "docs": [
              "Offset 141. 0 = Open, 1 = Active, 2 = Completed, 3 = Cancelled."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "docs": [
              "Offset 142. PDA bump for group_config."
            ],
            "type": "u8"
          },
          {
            "name": "groupCode",
            "docs": [
              "Offset 143. Human-readable group code, used as PDA seed."
            ],
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "memberRecord",
      "docs": [
        "One member's participation in one group. Closed by `close_member_record` once the group is",
        "Completed or Cancelled; its rent goes to `rent_payer`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "group",
            "docs": [
              "Offset 8. Reference to the GroupConfig PDA."
            ],
            "type": "pubkey"
          },
          {
            "name": "member",
            "docs": [
              "Offset 40. Member's wallet address."
            ],
            "type": "pubkey"
          },
          {
            "name": "rentPayer",
            "docs": [
              "Offset 72. Paid this record's rent at join_group. The only destination of that rent when",
              "the record is closed. Equals `member` when the member paid."
            ],
            "type": "pubkey"
          },
          {
            "name": "totalDeposited",
            "docs": [
              "Offset 104. Total tokens deposited across all periods."
            ],
            "type": "u64"
          },
          {
            "name": "depositsMade",
            "docs": [
              "Offset 112. Number of on-time deposits made (including initial)."
            ],
            "type": "u8"
          },
          {
            "name": "periodsDeposited",
            "docs": [
              "Offset 113. Per-period deposit tracking (max 52 periods)."
            ],
            "type": {
              "array": [
                "bool",
                52
              ]
            }
          },
          {
            "name": "bump",
            "docs": [
              "Offset 165. PDA bump for member_record."
            ],
            "type": "u8"
          }
        ]
      }
    }
  ]
};

