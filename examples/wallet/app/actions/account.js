// @flow
import type {
  AppState,
  Thunk,
  AccountKeys,
  AccountState
} from '../reducers/types';
import type {
  Amount,
  Address,
  PoolId,
  Delegation,
  Identifier,
  TransactionHash,
  Transaction
} from '../models';
import {
  getAccountFromPrivateKey,
  buildSendFundsTransaction,
  getAccountFromSeed,
  buildTransaction,
  buildDelegateTransaction
} from '../utils/wasmWrapper';
import {
  getAccountState,
  broadcastTransaction,
  getTransactions
} from '../utils/nodeConnection';
import { isValidMnemonic, createSeedFromMnemonic } from '../utils/mnemonic';

export type SetKeysAction = { type: 'SET_KEYS' } & AccountKeys;
export const SET_KEYS = 'SET_KEYS';

export function setAccount(privateKey: string): Thunk<SetKeysAction> {
  return function setAccountThunk(dispatch) {
    return getAccountFromPrivateKey(privateKey)
      .then((keys: AccountKeys) =>
        dispatch({
          type: SET_KEYS,
          ...keys
        })
      )
      .then(() =>
        Promise.all([
          dispatch(updateAccountTransactions()),
          dispatch(updateAccountState())
        ])
      );
  };
}

export function setAccountFromMnemonic(
  mnemonicPhrase: string,
  mnemonicPassword?: string
): Thunk<SetKeysAction> {
  if (isValidMnemonic(mnemonicPhrase)) {
    const seed = createSeedFromMnemonic(mnemonicPhrase, mnemonicPassword);
    return function setAccountThunk(dispatch) {
      return getAccountFromSeed(seed)
        .then((keys: AccountKeys) =>
          dispatch({
            type: SET_KEYS,
            ...keys
          })
        )
        .then(() => dispatch(updateAccountState()));
    };
  }
  return false;
}

export type SetAccountStateAction = {
  type: 'SET_ACCOUNT_STATE'
} & AccountState;
export const SET_ACCOUNT_STATE = 'SET_ACCOUNT_STATE';

export function updateAccountState(): Thunk<SetAccountState> {
  return function updateAccountStateThunk(dispatch, getState) {
    const { identifier }: { identifier: Identifier } = getState().account;
    if (!identifier) {
      console.log('not fetching account because wallet is not initialized yet');
      return;
    }
    return (
      getAccountState(identifier)
        .then(({ balance, counter, delegation }: AccountState) =>
          dispatch({
            type: SET_ACCOUNT_STATE,
            balance,
            counter,
            delegation
          })
        )
        // TODO: display a notification or something
        .catch(() => console.error('there was an error fetching account info'))
    );
  };
}

export type SetTransactionsAction = {
  type: 'SET_TRANSACTIONS',
  transactions: Array<Transaction>
};
export const SET_TRANSACTIONS = 'SET_TRANSACTIONS';

export function updateAccountTransactions(): Thunk<SetAccountStateAction> {
  return function updateAccountTransactionsThunk(dispatch, getState) {
    const { address }: { address: Address } = getState().account;
    if (!address) {
      console.log(
        'not fetching transactions because wallet is not initialized yet'
      );
      return;
    }
    return (
      getTransactions(address)
        .then(({ transactions }: { transactions: Array<Transaction> }) =>
          dispatch({
            type: SET_TRANSACTIONS,
            transactions
          })
        )
        // TODO: display a notification or something
        .catch(() => console.error('there was an error fetching transactions'))
    );
  };
}

export type SendTransactionAction = {
  type: 'SEND_TRANSACTION',
  newCounter: number,
  id: TransactionHash,
  destination: Address,
  amount: Amount,
  fee: Amount
};

export const SEND_TRANSACTION = 'SEND_TRANSACTION';

export function sendTransaction(
  destination: Address,
  amount: Amount
): Thunk<SendTransactionAction> {
  // Assume balance and counter are up to date
  return function sendTransactionThunk(dispatch, getState) {
    const state: AppState = getState();
    return buildSendFundsTransaction(
      destination,
      amount,
      state.account.privateKey,
      state.account.counter,
      state.nodeSettings
    )
      .then(({ id, transaction, fee }) => {
        return broadcastTransaction(transaction).then(() => ({ id, fee }));
      })
      .then(({ id, fee }) =>
        dispatch({
          type: SEND_TRANSACTION,
          newCounter: state.account.counter + 1,
          id,
          destination,
          amount,
          fee
        })
      );
  };
}

export type SendStakeDelegation = {
  type: 'SEND_STAKE_DELEGATION',
  newCounter: number,
  id: TransactionHash,
  pools: Array<PoolId>,
  fee: Amount
};

export const SEND_STAKE_DELEGATION = 'SEND_STAKE_DELEGATION';

export function sendStakeDelegation(
  newDelegation: Delegation
): Thunk<SendStakeDelegation> {
  // Assume balance and counter are up to date
  return function sendStakeDelegationThunk(dispatch, getState) {
    const state: AppState = getState();
    return buildDelegateTransaction(
      newDelegation,
      state.account.privateKey,
      state.account.counter,
      state.nodeSettings
    )
      .then(({ id, transaction, fee }) =>
        broadcastTransaction(transaction).then(() => ({ id, fee }))
      )
      .then(({ id, fee }) =>
        dispatch({
          type: SEND_STAKE_DELEGATION,
          newCounter: state.account.counter + 1,
          id,
          pools: Object.keys(newDelegation),
          fee
        })
      );
  };
}
