for file in ./out/*; do
    name=${file##*/}
    node print.js $name > out/$name/$name.md
done
 