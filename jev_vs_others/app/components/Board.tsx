'use client';
import { Chess, type Candidate } from '../../lib/chess';
import { destinationHeat } from '../../lib/heatmap';
const pieces: Record<string,string>={wk:'♚',wq:'♛',wr:'♜',wb:'♝',wn:'♞',wp:'♟',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟'};
const pieceNames: Record<string,string>={p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
export type BoardProps = {
  fen: string; highlight?: string; moves?: Candidate[]; source?: string|null; destination?: string|null;
  onSquare?: (square: string) => void;
};
export function Board({fen,highlight,moves=[],source=null,destination=null,onSquare}:BoardProps) {
  const board=new Chess(fen).board();
  const heat=new Map(destinationHeat(moves,source).map(row=>[row.square,row]));
  return <div className="board" role="group" aria-label="Chessboard. Select a piece to see its legal destinations, or a green square to inspect candidate moves.">
    {board.flatMap((rank,r)=>rank.map((piece,c)=>{
      const square='abcdefgh'[c]+(8-r), data=heat.get(square);
      const label=`${square}${piece?`, ${piece.color==='w'?'White':'Black'} ${pieceNames[piece.type]}`:''}${data?`, ${data.moves.length} legal candidate${data.moves.length===1?'':'s'}${data.weight!==undefined?`, ${(data.weight*100).toFixed(1)} percent combined weight`:''}`:''}`;
      const actionable=!!onSquare&&(!!data||moves.some(move=>move.uci.startsWith(square)));
      return <button type="button" key={square} aria-label={label} aria-pressed={source===square||destination===square} disabled={!actionable}
        onClick={()=>onSquare?.(square)} className={`square ${(r+c)%2?'dark':'light'} ${highlight?.slice(0,4).includes(square)?'highlight':''} ${data?'legal-target':''} ${source===square?'source-square':''} ${destination===square?'destination-square':''}`}
        style={data?{backgroundColor:`hsl(132 39% ${85-data.intensity*48}%)`}:undefined}>
        <span className={piece?.color==='w'?'white-piece':'black-piece'}>{piece?pieces[piece.color+piece.type]:''}</span>
        {data&&<span className={`heat-badge ${data.intensity>.6?'strong-heat':''}`}>{data.weight!==undefined?`${(data.weight*100).toFixed(1)}%`:'•'}{data.moves.length>1&&<small> ×{data.moves.length}</small>}</span>}
        {c===0&&<small className="rank">{8-r}</small>}{r===7&&<small className="file">{'abcdefgh'[c]}</small>}
      </button>;
    }))}
  </div>;
}
