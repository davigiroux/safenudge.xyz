/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/safenudge.json`.
 */
export type Safenudge = {
  "address": "88vmqe9yLF4mYtamaX53Cwg66GaxzyH391bQudcA8FcB",
  "metadata": {
    "name": "safenudge",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Group accountability savings protocol on Solana"
  },
  "instructions": [
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
          "writable": true,
          "signer": true
        },
        {
          "name": "creator",
          "docs": [
            "must match the wallet stored at group creation time. distribute is",
            "permissionless so the creator does not sign; we only need their pubkey."
          ],
          "writable": true,
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
            "Treasury USDC ATA. Created on the first cycle that charges a fee and",
            "reused thereafter. Authority is the treasury PDA above."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasuryAuthority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
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
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
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
        55,
        209,
        170,
        208,
        249,
        75,
        71,
        41
      ]
    },
    {
      "name": "memberRecord",
      "discriminator": [
        26,
        35,
        161,
        83,
        248,
        8,
        189,
        249
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
    }
  ],
  "types": [
    {
      "name": "groupConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "groupCode",
            "docs": [
              "Human-readable group code, used as PDA seed"
            ],
            "type": "string"
          },
          {
            "name": "creator",
            "docs": [
              "Group creator wallet — can start_cycle and emergency_cancel"
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "docs": [
              "USDC mint address"
            ],
            "type": "pubkey"
          },
          {
            "name": "depositAmount",
            "docs": [
              "Fixed deposit amount per period (token smallest unit)"
            ],
            "type": "u64"
          },
          {
            "name": "frequency",
            "docs": [
              "0 = weekly, 1 = biweekly, 2 = monthly"
            ],
            "type": "u8"
          },
          {
            "name": "totalPeriods",
            "docs": [
              "Number of deposit periods in the cycle (1-52)"
            ],
            "type": "u8"
          },
          {
            "name": "maxMembers",
            "docs": [
              "Max group size (2-10)"
            ],
            "type": "u8"
          },
          {
            "name": "currentMembers",
            "docs": [
              "Current member count"
            ],
            "type": "u8"
          },
          {
            "name": "penaltyType",
            "docs": [
              "0 = fixed amount, 1 = percentage (basis points)"
            ],
            "type": "u8"
          },
          {
            "name": "penaltyValue",
            "docs": [
              "Penalty value: fixed amount in token units, or basis points (500 = 5%)"
            ],
            "type": "u64"
          },
          {
            "name": "status",
            "docs": [
              "0 = Open, 1 = Active, 2 = Completed, 3 = Cancelled"
            ],
            "type": "u8"
          },
          {
            "name": "cycleStart",
            "docs": [
              "Unix timestamp when cycle started"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump for group_config"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "memberRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "group",
            "docs": [
              "Reference to the GroupConfig PDA"
            ],
            "type": "pubkey"
          },
          {
            "name": "member",
            "docs": [
              "Member's wallet address"
            ],
            "type": "pubkey"
          },
          {
            "name": "totalDeposited",
            "docs": [
              "Total tokens deposited across all periods"
            ],
            "type": "u64"
          },
          {
            "name": "depositsMade",
            "docs": [
              "Number of on-time deposits made (including initial)"
            ],
            "type": "u8"
          },
          {
            "name": "periodsDeposited",
            "docs": [
              "Per-period deposit tracking (max 52 periods)"
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
              "PDA bump for member_record"
            ],
            "type": "u8"
          }
        ]
      }
    }
  ]
};
