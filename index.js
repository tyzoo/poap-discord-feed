require('dotenv').config();
//set the enviornment variables in a .env file
const { TOKEN, DISCORD_CHANNEL_NAME } = process.env;

//Initial xDai/blockchain code by @brunitob
const Web3 = require('web3');
const PoapAbi = require('./Poap.json');
const inputDataDecoder = require('ethereum-input-data-decoder');
const XDAI_WS_PROVIDER = 'wss://xdai.poanetwork.dev/wss';
const POAP_XDAI_CONTRACT = '0x22C1f6050E56d2876009903609a2cC3fEf83B415';
const ZEROX = '0x0000000000000000000000000000000000000000';
const poapContractDecoder = new inputDataDecoder(PoapAbi);

const { default: axios } = require('axios');
const Discord = require('discord.js');
const bot = new Discord.Client();

bot.login(TOKEN);
bot.on('ready', () => {
	console.info(`Discord Bot logged in: ${bot.user.tag}!`);
});

const start = () => {
	console.log('+*+*+*+*+*+*+*+*+*+*+*+*+*+*+');
	console.log('Starting to listen POAP events...');
	console.log('+*+*+*+*+*+*+*+*+*+*+*+*+*+*+');

	const web3 = new Web3(new Web3.providers.WebsocketProvider(XDAI_WS_PROVIDER));

	// subscribe to xDAI blocks
	web3.eth
		.subscribe('newBlockHeaders')
		.on('data', async blockData => {
			var block = await web3.eth.getBlock(blockData.hash, true);
			if (block && block.transactions) {
				// console.log(blockData)
				console.log(`Checking TXs from block ${blockData.number}`);
				for (const tx of block.transactions) {
					if (tx.to == POAP_XDAI_CONTRACT) {
						const txDecoded = poapContractDecoder.decodeData(tx.input);

						const eventID = txDecoded.inputs[0].toString();
						const address = '0x' + txDecoded.inputs[1];

						console.log(
							`New POAP minted for event: ${eventID} from address: ${address} | method: ${txDecoded.method}`
						);
						// 	{
						// 	txDecoded: {
						// 		method: 'mintToken',
						// 		types: [ 'uint256', 'address' ],
						// 		inputs: [ [BN], '83a23d49af3281d783df7d1d469023b0321465ed' ],
						// 		names: [ 'eventId', 'to' ]
						// 	}
						// 	}
						axios
							.get(`https://api.poap.xyz/events/id/${eventID}`)
							.then(response => {
								// {"id":1337,"fancy_id":"1337-2021","name":"The 1337 Poap at MetaZoo International","event_url":"https://play.decentraland.org/?position=110%2C-23&realm=loki-amber","image_url":"https://storage.googleapis.com/poapmedia/1337-2021-logo-1616352411972.png","country":"111,-23","city":"Decentraland","description":"We are having a design contest for the 1337 POAP. To submit your design join THEZOO discord at https://discord.com/invite/xQrSf5XnP5.\n\nAwarded for claiming 10 or more POAPs at MetaZoo. Also available to be claimed at the MetaZoo International 1337 Event on 2021-04-20. \n\n(SUBJECT TO CHANGE)","year":2021,"start_date":"20-Apr-2021","end_date":"20-Apr-2021","from_admin":false,"virtual_event":true,"event_template_id":0}
								const {
									id: eventID,
									name: eventName,
									image_url,
								} = response.data;
								axios
									.get(`https://api.poap.xyz/actions/ens_lookup/${address}`)
									.then(ensResponse => {
										//ens is null if it is not valid
										const { ens } = ensResponse.data;
										axios
											.get(`https://api.poap.xyz/actions/scan/${address}`)
											.then(scanResponse => {
												const poapPower = scanResponse.data.length;
												logPoap({
													action: 'minted', //to do: handle migrated case
													eventID,
													eventName,
													address,
													image_url,
													poapPower,
													ens,
												});
											})
											.catch(e => console.log(e));
									})
									.catch(e => console.log(e));
							})
							.catch(e => console.log(e));
					}
				}
			}
		})
		.on('error', error => {
			console.error(error);
		});
};

const logPoap = async data => {
	const {
		image_url,
		action,
		eventID,
		eventName,
		poapPower,
		address,
		ens,
	} = data;
	axios
		.get(image_url, {
			responseType: 'arraybuffer',
		})
		.then(response => {
			response = Buffer.from(response.data, 'binary');
			const attachment = new Discord.MessageAttachment(response, 'image.png');
			attachment.width = 100;
			attachment.height = 100;
			const channel = bot.channels.cache.find(
				ch => ch.name === DISCORD_CHANNEL_NAME
			);
			if (!channel) return;
			const embed = new Discord.MessageEmbed() // Ver 12.2.0 of Discord.js
				.setTitle(`just ${action} the ${eventName} POAP`)
				.setDescription(
					`POAP Power: ${poapPower} ${emoji(poapPower)} | Event ID#: ${eventID}`
				)
				.setTimestamp()
				.setAuthor(
					ens ? ens : address,
					image_url,
					`https://app.poap.xyz/scan/${address}`
				)
				.attachFiles([attachment])
				.setThumbnail('attachment://image.png');
			embed.type = 'image';
			channel.send(embed);
		})
		.catch(e => console.log(e.message));
};

const emoji = poapPower => {
	return poapPower <= 5
		? '🆕'
		: poapPower <= 10
		? '🟢'
		: poapPower <= 20
		? '🟡'
		: poapPower <= 50
		? '🔴'
		: '🔥';
};

start();
