/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/safenudge.json`.
 */
export type Safenudge = {
  "address": "FJYGbzdtS56PZDghiUT42UbgHg4VXh3DLoPehXHY5qKW",
  "metadata": {
    "name": "safenudge",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Group accountability savings protocol on Solana"
  },
  "instructions": [
    {
      "name": "closeGroup",
      "discriminator": [
        40,
        187,
        201,
        187,
        18,
        194,
        122,
        232
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
            "wallet that signed and paid at create_group, so the caller cannot redirect the rent."
          ],
          "writable": true
        },
        {
          "name": "joinGate",
          "docs": [
            "only when this program owns it. Only `set_join_authority` can create a program-owned",
            "account at that address, and `Account::try_from` still checks its owner and",
            "discriminator before the close. Any other owner means the group has no gate."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  105,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "groupConfig"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closeJoinTally",
      "docs": [
        "Closes one member's JoinTally after the group at its address is closed. `member` is only",
        "a seed of `join_tally`, read through `#[instruction(member: Pubkey)]`."
      ],
      "discriminator": [
        10,
        78,
        107,
        65,
        30,
        119,
        152,
        70
      ],
      "accounts": [
        {
          "name": "groupConfig",
          "docs": [
            "program-owned account at a group address, and `close_group` hands it back to the system",
            "program, so an owner other than this program means no group lives there now. A new group",
            "at the freed code is program-owned again, and the close fails until that group closes."
          ]
        },
        {
          "name": "joinTally",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  108,
                  108,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "groupConfig"
              },
              {
                "kind": "arg",
                "path": "member"
              }
            ]
          }
        },
        {
          "name": "rentPayer",
          "docs": [
            "not a signer or an authority. The constraint on `join_tally` pins its key to the wallet",
            "that paid at the first join_group, so the caller cannot redirect the rent."
          ],
          "writable": true
        }
      ],
      "args": [
        {
          "name": "member",
          "type": "pubkey"
        }
      ]
    },
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
      "docs": [
        "Returns every member's deposits once the cycle has ended and closes the vault."
      ],
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
            "Permissionless caller triggering settlement. Pays only the transaction fee, never rent."
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
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "emergencyCancel",
      "docs": [
        "Returns every member's deposits and closes the vault. With no members, burns any",
        "balance in the vault first: `mint` must then be writable, or it fails with",
        "`MintNotWritable`."
      ],
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
      "name": "joinGroup",
      "docs": [
        "Joins with the first deposit. `expected_terms` must equal the group's terms.",
        "`expected_joins`, when given, must equal the member's JoinTally count before this join",
        "(0 for a first join). A gated group requires it."
      ],
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
            "Pays the member_record rent, and the join_tally rent at the first join, and is recorded as",
            "the destination of each rent when that account is closed. May be the same key as `member`."
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
            "mint too), so the first deposit comes from the account clients look up."
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
        },
        {
          "name": "joinGate",
          "docs": [
            "only when this program owns it. Only `set_join_authority` can create a program-owned",
            "account at that address, so a program-owned account here is this group's JoinGate, and",
            "`try_deserialize` still checks its discriminator. Any other owner means no gate: a wallet",
            "can send lamports to the address, but cannot make it program-owned."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  105,
                  110
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
          "name": "joinAuthority",
          "docs": [
            "Must sign when the group has a JoinGate. Ignored when it has none."
          ],
          "signer": true,
          "optional": true
        },
        {
          "name": "instructionsSysvar",
          "docs": [
            "writes. The handler reads it only through `load_instruction_at_checked`."
          ],
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "joinTally",
          "docs": [
            "Created at the first join and paid by `rent_payer`; every later join adds one. Last in the",
            "list so the accounts before it keep their positions."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  108,
                  108,
                  121
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
        }
      ],
      "args": [
        {
          "name": "expectedTerms",
          "type": {
            "defined": {
              "name": "groupTerms"
            }
          }
        },
        {
          "name": "expectedJoins",
          "type": {
            "option": "u32"
          }
        }
      ]
    },
    {
      "name": "leaveGroup",
      "discriminator": [
        10,
        4,
        125,
        28,
        46,
        23,
        233,
        29
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
          "name": "rentPayer",
          "docs": [
            "not a signer or an authority. The constraint on `member_record` pins its key to the",
            "wallet that signed and paid at join_group, so the member cannot redirect the rent."
          ],
          "writable": true
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
      "name": "setJoinAuthority",
      "docs": [
        "Makes every later join_group of an Open, empty group require the signature of",
        "`authority`. Once per group; there is no instruction to change or remove it."
      ],
      "discriminator": [
        5,
        217,
        163,
        240,
        141,
        254,
        146,
        212
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "rentPayer",
          "docs": [
            "Pays the join_gate rent. Must be the group's recorded rent payer, so close_group can",
            "return that rent to the same wallet as the GroupConfig rent."
          ],
          "writable": true,
          "signer": true
        },
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
          "name": "joinGate",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  105,
                  110
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "authority",
          "type": "pubkey"
        }
      ]
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
        53
      ]
    },
    {
      "name": "joinGate",
      "discriminator": [
        115,
        110,
        74,
        111,
        105,
        110,
        71,
        49
      ]
    },
    {
      "name": "joinTally",
      "discriminator": [
        115,
        110,
        84,
        97,
        108,
        108,
        121,
        49
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
        51
      ]
    }
  ],
  "events": [
    {
      "name": "cycleStarted",
      "discriminator": [
        231,
        147,
        105,
        141,
        120,
        108,
        122,
        245
      ]
    },
    {
      "name": "depositMade",
      "discriminator": [
        210,
        201,
        130,
        183,
        244,
        203,
        155,
        199
      ]
    },
    {
      "name": "groupCancelled",
      "discriminator": [
        59,
        49,
        243,
        198,
        10,
        174,
        169,
        2
      ]
    },
    {
      "name": "groupClosed",
      "discriminator": [
        131,
        184,
        184,
        15,
        45,
        220,
        241,
        73
      ]
    },
    {
      "name": "groupCreated",
      "discriminator": [
        132,
        94,
        184,
        198,
        77,
        165,
        13,
        26
      ]
    },
    {
      "name": "groupSettled",
      "discriminator": [
        200,
        143,
        16,
        245,
        188,
        210,
        168,
        67
      ]
    },
    {
      "name": "joinAuthoritySet",
      "discriminator": [
        33,
        138,
        165,
        55,
        55,
        34,
        248,
        220
      ]
    },
    {
      "name": "memberJoined",
      "discriminator": [
        156,
        199,
        149,
        88,
        193,
        203,
        191,
        210
      ]
    },
    {
      "name": "memberLeft",
      "discriminator": [
        48,
        83,
        72,
        92,
        111,
        227,
        133,
        142
      ]
    },
    {
      "name": "memberSettled",
      "discriminator": [
        72,
        233,
        24,
        245,
        134,
        123,
        209,
        78
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
      "name": "invalidFrequency",
      "msg": "Invalid frequency value"
    },
    {
      "code": 6009,
      "name": "invalidGroupSize",
      "msg": "Invalid group size"
    },
    {
      "code": 6010,
      "name": "invalidPeriodCount",
      "msg": "Invalid period count"
    },
    {
      "code": 6011,
      "name": "invalidDepositAmount",
      "msg": "Deposit amount must be greater than zero"
    },
    {
      "code": 6012,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6013,
      "name": "invalidMint",
      "msg": "Token mint does not match group configuration"
    },
    {
      "code": 6014,
      "name": "memberCountMismatch",
      "msg": "Member count mismatch in distribution"
    },
    {
      "code": 6015,
      "name": "invalidAccountOwner",
      "msg": "Account is not owned by this program"
    },
    {
      "code": 6016,
      "name": "invalidMemberRecord",
      "msg": "Member record does not match the canonical PDA for its member"
    },
    {
      "code": 6017,
      "name": "invalidTokenAccountOwner",
      "msg": "Destination token account does not belong to the expected member"
    },
    {
      "code": 6018,
      "name": "duplicateMemberRecord",
      "msg": "The same member record was passed more than once"
    },
    {
      "code": 6019,
      "name": "invalidRentPayer",
      "msg": "Rent refund destination does not match the recorded rent payer"
    },
    {
      "code": 6020,
      "name": "recordRetentionNotElapsed",
      "msg": "Member records stay open for the retention period after settlement"
    },
    {
      "code": 6021,
      "name": "unsupportedMint",
      "msg": "This mint cannot be used for a group"
    },
    {
      "code": 6022,
      "name": "mintNotWritable",
      "msg": "Mint must be writable to cancel a group with no members whose vault holds tokens"
    },
    {
      "code": 6023,
      "name": "groupHasOpenRecords",
      "msg": "Close every member record before closing the group"
    },
    {
      "code": 6024,
      "name": "groupHasMembers",
      "msg": "The join authority can only be set before anyone joins"
    },
    {
      "code": 6025,
      "name": "invalidJoinAuthority",
      "msg": "The join authority cannot be the default public key or the program ID"
    },
    {
      "code": 6026,
      "name": "joinNotApproved",
      "msg": "This group needs its join authority to approve the join"
    },
    {
      "code": 6027,
      "name": "durableNonceNotAllowed",
      "msg": "A gated join cannot use a durable nonce"
    },
    {
      "code": 6028,
      "name": "groupNotClosed",
      "msg": "Close the group before closing a join tally"
    },
    {
      "code": 6029,
      "name": "joinCountMismatch",
      "msg": "The member's join count no longer matches the approved join"
    },
    {
      "code": 6030,
      "name": "expectedJoinsRequired",
      "msg": "A gated join must name the member's expected join count"
    },
    {
      "code": 6031,
      "name": "termsMismatch",
      "msg": "The group's terms changed since the join was signed"
    },
    {
      "code": 6032,
      "name": "vaultShortfall",
      "msg": "The vault holds less than the members deposited"
    }
  ],
  "types": [
    {
      "name": "cycleStarted",
      "docs": [
        "The creator started the cycle."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "group",
            "type": "pubkey"
          },
          {
            "name": "members",
            "type": "u8"
          },
          {
            "name": "cycleStart",
            "type": "i64"
          },
          {
            "name": "cycleEnd",
            "docs": [
              "First timestamp at which `distribute` accepts the group."
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "depositMade",
      "docs": [
        "A member deposited for a period."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "group",
            "type": "pubkey"
          },
          {
            "name": "member",
            "type": "pubkey"
          },
          {
            "name": "period",
            "docs": [
              "Zero-based period index."
            ],
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "depositsMade",
            "docs": [
              "Deposits after this one, the join deposit included."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "groupCancelled",
      "docs": [
        "The creator cancelled the group and the vault closed."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "group",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "members",
            "type": "u8"
          },
          {
            "name": "refundedTotal",
            "docs": [
              "Tokens sent to members."
            ],
            "type": "u64"
          },
          {
            "name": "burned",
            "docs": [
              "Tokens burned from the vault of a group with no members. Zero otherwise."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "groupClosed",
      "docs": [
        "`close_group` closed a settled group and paid its rent to the rent payer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "group",
            "type": "pubkey"
          },
          {
            "name": "rentPayer",
            "type": "pubkey"
          },
          {
            "name": "lamports",
            "docs": [
              "GroupConfig lamports, the vault rent included when `refund_vault_rent` never ran."
            ],
            "type": "u64"
          },
          {
            "name": "joinGateLamports",
            "docs": [
              "JoinGate lamports. Zero when the group has no gate."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "groupConfig",
      "docs": [
        "One savings group. `close_group` closes it once settled and every member record is closed.",
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
            "name": "cycleStart",
            "docs": [
              "Offset 112. Unix timestamp when the cycle started; 0 while Open."
            ],
            "type": "i64"
          },
          {
            "name": "settledAt",
            "docs": [
              "Offset 120. Unix timestamp of distribute or emergency_cancel; 0 until then."
            ],
            "type": "i64"
          },
          {
            "name": "frequency",
            "docs": [
              "Offset 128. 0 = weekly, 1 = biweekly, 2 = monthly."
            ],
            "type": "u8"
          },
          {
            "name": "totalPeriods",
            "docs": [
              "Offset 129. Number of deposit periods in the cycle (1-52)."
            ],
            "type": "u8"
          },
          {
            "name": "maxMembers",
            "docs": [
              "Offset 130. Max group size (2-10)."
            ],
            "type": "u8"
          },
          {
            "name": "currentMembers",
            "docs": [
              "Offset 131. Open MemberRecords of this group: join_group adds one, leave_group and",
              "close_member_record subtract one. Zero proves no record exists, so `close_group` can",
              "free the group code without a later group inheriting a record."
            ],
            "type": "u8"
          },
          {
            "name": "status",
            "docs": [
              "Offset 132. 0 = Open, 1 = Active, 2 = Completed, 3 = Cancelled."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "docs": [
              "Offset 133. PDA bump for group_config."
            ],
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "docs": [
              "Offset 134. Canonical PDA bump for the vault, stored by create_group so the instructions",
              "that take the vault derive it once instead of searching for it."
            ],
            "type": "u8"
          },
          {
            "name": "reserved",
            "docs": [
              "Offset 135. Zero. Room for fixed-size fields added later, so a new field does not move",
              "`group_code` or force every live group to settle before the upgrade."
            ],
            "type": {
              "array": [
                "u8",
                73
              ]
            }
          },
          {
            "name": "groupCode",
            "docs": [
              "Offset 208. Human-readable group code, used as PDA seed."
            ],
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "groupCreated",
      "docs": [
        "A group was created by `create_group`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "group",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "rentPayer",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "depositAmount",
            "type": "u64"
          },
          {
            "name": "totalPeriods",
            "type": "u8"
          },
          {
            "name": "maxMembers",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "groupSettled",
      "docs": [
        "`distribute` settled the group and closed the vault."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "group",
            "type": "pubkey"
          },
          {
            "name": "members",
            "type": "u8"
          },
          {
            "name": "totalPaid",
            "docs": [
              "Sum of `MemberSettled.payout`, equal to the vault balance before settlement."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "groupTerms",
      "docs": [
        "What a member agrees to when joining. `join_group` takes the terms the client showed and",
        "fails unless the group still has them, so a join signed for one group cannot land in a group",
        "created later at the same code on other terms."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
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
          }
        ]
      }
    },
    {
      "name": "joinAuthoritySet",
      "docs": [
        "The creator required a join authority signature on every later join."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "group",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "joinGate",
      "docs": [
        "Makes `join_group` of one group require the signature of `authority`.",
        "",
        "Lives at PDA `[\"join\", group_config]`. `set_join_authority` creates it and `close_group`",
        "closes it, so it never outlives its group. The address names the group, so the account",
        "stores only the authority."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Offset 8. Must sign every join_group of the group."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "joinTally",
      "docs": [
        "Counts the joins of one member at one group address, across `leave_group`.",
        "",
        "Lives at PDA `[\"tally\", group_config, member]`. `join_group` creates it at the first join and",
        "adds one at every join. `leave_group` and `close_member_record` never touch it, and it outlives",
        "`close_group`. Only `close_join_tally` closes it, once no group lives at its group address.",
        "The address names the group and the member, so the account stores neither."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rentPayer",
            "docs": [
              "Offset 8. Paid this account's rent at the first join_group. The only destination of that",
              "rent when the tally is closed. A later join never rewrites it."
            ],
            "type": "pubkey"
          },
          {
            "name": "joins",
            "docs": [
              "Offset 40. Successful join_group calls of this member at this group address. Never zero",
              "on a stored tally: the join that creates the account also counts itself."
            ],
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "memberJoined",
      "docs": [
        "A member joined with the first deposit."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "group",
            "type": "pubkey"
          },
          {
            "name": "member",
            "type": "pubkey"
          },
          {
            "name": "rentPayer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "First deposit moved into the vault."
            ],
            "type": "u64"
          },
          {
            "name": "currentMembers",
            "docs": [
              "Members after this join."
            ],
            "type": "u8"
          },
          {
            "name": "joins",
            "docs": [
              "This member's joins at this group address, this one included."
            ],
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "memberLeft",
      "docs": [
        "A member left an Open group and got the recorded deposit back."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "group",
            "type": "pubkey"
          },
          {
            "name": "member",
            "type": "pubkey"
          },
          {
            "name": "refund",
            "type": "u64"
          },
          {
            "name": "currentMembers",
            "docs": [
              "Members after this leave."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "memberRecord",
      "docs": [
        "One member's participation in one group."
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
          },
          {
            "name": "reserved",
            "docs": [
              "Offset 166. Zero. Room for fields added later without a new layout."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "memberSettled",
      "docs": [
        "One member's result of `distribute`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "group",
            "type": "pubkey"
          },
          {
            "name": "member",
            "type": "pubkey"
          },
          {
            "name": "deposited",
            "type": "u64"
          },
          {
            "name": "payout",
            "docs": [
              "Tokens sent to the member: `deposited`, plus, for the last member, any tokens sent to the",
              "vault from outside the program."
            ],
            "type": "u64"
          }
        ]
      }
    }
  ]
};
