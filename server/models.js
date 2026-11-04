import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const Mixed = Schema.Types.Mixed;
const xiP = { name:String, order:Number, impact:Number, runs:Number, balls:Number, out:Boolean, wk:Number, conc:Number, ob:Number };
export const Team = model('Team', new Schema({
  code:String, name:String, league:String, domestic:{type:Boolean,default:false},
  color:String, accent:String, titles:[Number], champion:{type:Boolean,default:false}, champOf:[String]}));
export const Player = model('Player', new Schema({
  name:{ type:String, index:true }, team:String, role:String, slot:String, keeper:Boolean, captain:Boolean, jersey:Number, impact:Number,
  recent:[Number], active:Boolean, lastDate:String, first:String, last:String, matches:Number, national:String, natActive:Boolean,
  stats:Mixed, years:Mixed, best:Mixed, bestY:Mixed }));
export const Match = model('Match', new Schema({
  key:{ type:String, index:{ unique:true, sparse:true } }, source:String, status:String, liveId:String, score:String,
  matchId:String, format:String, season:String, date:{ type:String, index:true }, league:String, venue:String, teamA:String, teamB:String,
  nameA:String, nameB:String, seenAt:Date, startAt:Date, confirmed:Boolean, verified:Boolean,
  tossWinner:String, tossDecision:String, winner:String, margin:String, playerOfMatch:String, event:String, stage:String, xiA:[xiP], xiB:[xiP]}));
export const Honour = model('Honour', new Schema({ event:String, season:String, year:Number, code:String }));
export const Bookmark = model('Bookmark', new Schema({ userId:String, kind:String, refId:String }));
export const ApiUsage = model('ApiUsage', new Schema({ provider: String, day: String, count: { type: Number, default: 0 } }));