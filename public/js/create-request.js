document.addEventListener('partials:loaded', () => {
  const user = SCStore.getUser();
  document.getElementById('sidebarUserName').textContent = user.name;
  document.getElementById('sidebarAvatar').textContent = SC.initials(user.name);
  document.getElementById('userChipLogout')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/';
  });

  const grid = document.getElementById('methodGrid');
  let selectedMethod = SC.PAYMENT_METHODS[0].id;
  const cryptoMarkets = [
    'Aave (AAVE)', 'Algorand (ALGO)', 'Aptos (APT)', 'Arbitrum (ARB)', 'Avalanche (AVAX)',
    'BNB (BNB)', 'Bitcoin (BTC)', 'Bitcoin Cash (BCH)', 'Cardano (ADA)', 'Chainlink (LINK)',
    'Cosmos (ATOM)', 'Dai (DAI)', 'Dogecoin (DOGE)', 'Ethereum (ETH)', 'Fantom (FTM)',
    'Filecoin (FIL)', 'Hedera (HBAR)', 'Internet Computer (ICP)', 'Kaspa (KAS)', 'Litecoin (LTC)',
    'Monero (XMR)', 'Near Protocol (NEAR)', 'Optimism (OP)', 'Pepe (PEPE)', 'Polkadot (DOT)',
    'Polygon (POL)', 'Ripple (XRP)', 'Render (RENDER)', 'Shiba Inu (SHIB)', 'Solana (SOL)',
    'Stellar (XLM)', 'Sui (SUI)', 'Toncoin (TON)', 'TRON (TRX)', 'Uniswap (UNI)',
    'USD Coin (USDC)', 'Tether (USDT)', 'VeChain (VET)', 'Worldcoin (WLD)', 'XDC Network (XDC)',
    'Zcash (ZEC)'
  ];
  const cryptoMarketCard = document.getElementById('cryptoMarketCard');
  const cryptoMarket = document.getElementById('cryptoMarket');
  const cryptoMarketGrid = document.getElementById('cryptoMarketGrid');
  const cryptoSymbols = {
    'Aave (AAVE)': 'aave', 'Algorand (ALGO)': 'algo', 'Aptos (APT)': 'apt', 'Arbitrum (ARB)': 'arb', 'Avalanche (AVAX)': 'avax',
    'BNB (BNB)': 'bnb', 'Bitcoin (BTC)': 'btc', 'Bitcoin Cash (BCH)': 'bch', 'Cardano (ADA)': 'ada', 'Chainlink (LINK)': 'link',
    'Cosmos (ATOM)': 'atom', 'Dai (DAI)': 'dai', 'Dogecoin (DOGE)': 'doge', 'Ethereum (ETH)': 'eth', 'Fantom (FTM)': 'ftm',
    'Filecoin (FIL)': 'fil', 'Hedera (HBAR)': 'hbar', 'Internet Computer (ICP)': 'icp', 'Kaspa (KAS)': 'kas', 'Litecoin (LTC)': 'ltc',
    'Monero (XMR)': 'xmr', 'Near Protocol (NEAR)': 'near', 'Optimism (OP)': 'op', 'Pepe (PEPE)': 'pepe', 'Polkadot (DOT)': 'dot',
    'Polygon (POL)': 'pol', 'Ripple (XRP)': 'xrp', 'Render (RENDER)': 'rnd', 'Shiba Inu (SHIB)': 'shib', 'Solana (SOL)': 'sol',
    'Stellar (XLM)': 'xlm', 'Sui (SUI)': 'sui', 'Toncoin (TON)': 'ton', 'TRON (TRX)': 'trx', 'Uniswap (UNI)': 'uni',
    'USD Coin (USDC)': 'usdc', 'Tether (USDT)': 'usdt', 'VeChain (VET)': 'vet', 'Worldcoin (WLD)': 'wld', 'XDC Network (XDC)': 'xdc',
    'Zcash (ZEC)': 'zec'
  };
  const cryptoBadgeOverrides = {
    'Aptos (APT)': 'https://coin-images.coingecko.com/coins/images/26455/large/Aptos-Network-Symbol-Black-RGB-1x.png',
    'Arbitrum (ARB)': 'https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg',
    'Fantom (FTM)': 'https://coin-images.coingecko.com/coins/images/4001/large/Fantom_round.png',
    'Hedera (HBAR)': 'https://coin-images.coingecko.com/coins/images/3688/large/hbar.png',
    'Kaspa (KAS)': 'https://coin-images.coingecko.com/coins/images/25751/large/kaspa-icon-exchanges.png',
    'Near Protocol (NEAR)': 'https://coin-images.coingecko.com/coins/images/10365/large/near.jpg',
    'Optimism (OP)': 'https://coin-images.coingecko.com/coins/images/25244/large/Token.png',
    'Pepe (PEPE)': 'https://coin-images.coingecko.com/coins/images/29850/large/pepe-token.jpeg',
    'Polygon (POL)': 'https://coin-images.coingecko.com/coins/images/32440/large/pol.png',
    'Render (RENDER)': 'https://coin-images.coingecko.com/coins/images/11636/large/rndr.png',
    'Shiba Inu (SHIB)': 'https://coin-images.coingecko.com/coins/images/11939/large/shiba.png',
    'Sui (SUI)': 'https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png',
    'Toncoin (TON)': 'https://cdn.simpleicons.org/ton',
    'Worldcoin (WLD)': 'https://coin-images.coingecko.com/coins/images/31069/large/worldcoin.jpeg',
    'XDC Network (XDC)': 'https://coin-images.coingecko.com/coins/images/2912/large/xdc-icon.png'
  };
  cryptoMarket.innerHTML += cryptoMarkets.map(market => `<option value="${market}">${market}</option>`).join('');
  cryptoMarketGrid.innerHTML = cryptoMarkets.map(market => {
    const symbol = cryptoSymbols[market];
    const badgeUrl = cryptoBadgeOverrides[market] || `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/${symbol}.png`;
    return `<button class="crypto-market-option" type="button" data-market="${market}" role="option" aria-selected="false">
      <img src="${badgeUrl}" alt="${market} badge" loading="lazy">
      <span>${market}</span>
    </button>`;
  }).join('');

  function selectCryptoMarket(market){
    cryptoMarket.value = market;
    SC.qsa('.crypto-market-option', cryptoMarketGrid).forEach(option => {
      const selected = option.dataset.market === market;
      option.classList.toggle('selected', selected);
      option.setAttribute('aria-selected', selected);
    });
    updateSummary();
  }
  cryptoMarketGrid.addEventListener('click', event => {
    const option = event.target.closest('.crypto-market-option');
    if (option) selectCryptoMarket(option.dataset.market);
  });
  cryptoMarket.addEventListener('change', () => selectCryptoMarket(cryptoMarket.value));

  grid.innerHTML = SC.PAYMENT_METHODS.map(m => `
    <div class="method-option ${m.id === selectedMethod ? 'selected' : ''}" data-method="${m.id}" role="button" tabindex="0">
      ${SC.methodIcon(m.id)}
      <div class="mo-label">${m.label}</div>
    </div>
  `).join('');

  function selectMethod(id){
    selectedMethod = id;
    SC.qsa('.method-option', grid).forEach(el => el.classList.toggle('selected', el.dataset.method === id));
    cryptoMarketCard.hidden = id !== 'crypto';
    if (id !== 'crypto') {
      selectCryptoMarket('');
      setError('fCryptoMarket', false);
    }
    updateSummary();
  }
  grid.addEventListener('click', (e) => {
    const opt = e.target.closest('.method-option');
    if (opt) selectMethod(opt.dataset.method);
  });
  grid.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' '){
      const opt = e.target.closest('.method-option');
      if (opt){ e.preventDefault(); selectMethod(opt.dataset.method); }
    }
  });

  const amountEl = document.getElementById('amount');
  const rewardEl = document.getElementById('reward');

  function updateSummary(){
    const amount = parseFloat(amountEl.value) || 0;
    const reward = parseFloat(rewardEl.value) || 0;
    document.getElementById('sumMethod').textContent = SC.methodMeta(selectedMethod).label;
    document.getElementById('sumCryptoRow').hidden = selectedMethod !== 'crypto';
    document.getElementById('sumCrypto').textContent = cryptoMarket.value || '—';
    document.getElementById('sumAmount').textContent = SC.fmtMoney(amount);
    document.getElementById('sumReward').textContent = SC.fmtMoney(reward);
    document.getElementById('sumTotal').textContent = SC.fmtMoney(amount + reward);
  }
  amountEl.addEventListener('input', () => {
    if (!rewardEl.dataset.touched){
      const suggested = Math.round((parseFloat(amountEl.value) || 0) * 0.025 * 100) / 100;
      rewardEl.value = suggested || '';
    }
    updateSummary();
  });
  rewardEl.addEventListener('input', () => { rewardEl.dataset.touched = '1'; updateSummary(); });
  updateSummary();

  function setError(fieldId, hasError){
    document.getElementById(fieldId)?.classList.toggle('has-error', hasError);
  }

  const form = document.getElementById('createForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const recipient = document.getElementById('recipient');
    let valid = true;

    if (!amountEl.value || parseFloat(amountEl.value) <= 0){ setError('fAmount', true); valid = false; } else setError('fAmount', false);
    const recipientOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.value) || /^[+\d][\d\s-]{6,}$/.test(recipient.value);
    if (!recipientOk){ setError('fRecipient', true); valid = false; } else setError('fRecipient', false);
    if (selectedMethod === 'crypto' && !cryptoMarket.value){ setError('fCryptoMarket', true); valid = false; }
    else setError('fCryptoMarket', false);
    if (!valid) return;

    const btn = document.getElementById('createSubmit');
    SC.setLoading(btn, true);

    setTimeout(() => {
      const amount = parseFloat(amountEl.value);
      const reward = parseFloat(rewardEl.value) || 0;
      const req = {
        id: SC.uid('REQ'),
        requester: 'You',
        recipient: recipient.value,
        method: selectedMethod,
        cryptoMarket: selectedMethod === 'crypto' ? cryptoMarket.value : null,
        amount,
        reward,
        total: Math.round((amount + reward) * 100) / 100,
        status: 'open',
        createdAt: new Date().toISOString(),
        note: document.getElementById('note').value || 'No additional note provided.',
        mine: true,
      };
      SCStore.add(req);
      SC.setLoading(btn, false);

      document.getElementById('successSub').textContent = `${req.id} for ${SC.fmtMoney(req.total)} is now live to the network.`;
      document.getElementById('successModal').classList.add('show');
    }, 900);
  });
});
