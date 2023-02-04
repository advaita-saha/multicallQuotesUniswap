const ethers = require("ethers");
const { MultiCall } = require('@indexed-finance/multicall')

const { abi: IUniswapV3PoolABI } = require("@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json");
const { abi: QuoterABI } = require("@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json");

const { getAbi, getPoolImmutables } = require('./helpers');
require('dotenv').config();

// Set the Infura URL, Get the Infura URL from the .env file
// set the pool addresses and the quoter address
const INFURA_URL 	= process.env.INFURA_URL;
const provider 		= new ethers.providers.JsonRpcProvider(INFURA_URL);

const quoterAddress = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";         // Quoter Contract
const pools = [
	"0x290a6a7460b308ee3f19023d2d00de604bcf5b42",	// MATIC/ETH
	"0xcbcdf9626bc03e24f779434178a73a0b4bad62ed",	// WBTC/ETH
	"0x2F62f2B4c5fcd7570a709DeC05D68EA19c82A9ec",	// SHIB/ETH
	"0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801",	// UNI/ETH
];

// Get the token details for each pool
async function getToken(inputAmount, poolAddress){

  // Instantiate the pool contract
  const poolContract = new ethers.Contract(
    poolAddress,
    IUniswapV3PoolABI,
    provider
  );

  // Get the token addresses from the pool contract
  const tokenAddress0 = await poolContract.token0();
  const tokenAddress1 = await poolContract.token1();

  // Get the ABI for the tokens contracts 
  const tokenAbi0 = await getAbi(tokenAddress0);
  const tokenAbi1 = await getAbi(tokenAddress1);

  // Instantiate the token contract 1
  const tokenContract0 = new ethers.Contract(
    tokenAddress0,
    tokenAbi0,
    provider
  );
  // Instantiate the token contract 2
  const tokenContract1 = new ethers.Contract(
    tokenAddress1,
    tokenAbi1,
    provider
  );

  // Get the token symbols and decimals from the token contracts
  // We need this to format the amountIn and amountOut
  // also to display the token symbols in the console
  const tokenSymbol0 	= await tokenContract0.symbol();
  const tokenSymbol1 	= await tokenContract1.symbol();
  const tokenDecimals0 	= await tokenContract0.decimals();
  const tokenDecimals1 	= await tokenContract1.decimals();

  // Get the pool immutables
  const immutables = await getPoolImmutables(poolContract)
  const amountIn = ethers.utils.parseUnits(
    inputAmount.toString(),
    tokenDecimals0
  );

  // Generate the params for the quoteExactInputSingle function
  const params = [
    immutables.token0,
    immutables.token1,
    immutables.fee,
    amountIn,
    0,
  ];

  // Generate the calldata for the multicall packaged 
  // in an object with the token symbols
  const call = {
	inputAmount: inputAmount,
	tokenSymbol0: tokenSymbol0,
	tokenSymbol1: tokenSymbol1,
	calldata: {
		target: quoterAddress,
		function: 'quoteExactInputSingle',
		args: params,
  }};

  return call;

}

async function multicaller(tokenData){

	// Instantiate the multicall contract
	const multi = new MultiCall(provider);

	// Generate the calldata array for the multicall
	// from the tokenData array, which contains the
	// calldata for each token pair
	let calls = [];
	for(let i=0; i<tokenData.length; i++){
		calls.push(tokenData[i].calldata);
	}

	// Execute the multicall
	const roundData = await multi.multiCall(QuoterABI, calls);
    console.log("BlockNo for the multicall: ", roundData[0].toString());

	// Format the amountOut and display the price
	// for each token pair
	for(let i=0; i<roundData[1].length; i++){
		const amountOut = ethers.utils.formatUnits(roundData[1][i].toString(), 18);
		console.log('=========');
		console.log(`${tokenData[i].inputAmount} ${tokenData[i].tokenSymbol0} price is ${amountOut} ${tokenData[i].tokenSymbol1}`);
		console.log('=========');
	}
}

async function main() {
	let callArr = [];

	// Get the basic token info and generate the calldata
	// for each token pair, so that we can initiate the multicall
	for(let i=0; i<pools.length; i++){
		console.log(`Generating request for Pool Address (Index - ${i}): `, pools[i]);
		const encData = await getToken(1, pools[i]);
		callArr.push(encData);
	}

	// Execute the multicall
	await multicaller(callArr);

}

main();
